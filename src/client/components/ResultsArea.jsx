import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Map from "./Map";
import ShareCenter from "./ShareCenter";
import { formatDateTime, formatMinutes, formatDuration } from "../utils";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const RISK_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  neutral: 3,
};

function normalizeRiskLabel(value) {
  const lower = String(value || "").trim().toLowerCase();
  if (lower === "low" || lower === "medium" || lower === "high") {
    return lower;
  }
  return "neutral";
}

function normalizeCandidateName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function candidateNamesMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  return normalizeCandidateName(left) === normalizeCandidateName(right);
}

function toFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function buildSelectedCandidateFromPlan(currentPlan) {
  const selectedPoi = currentPlan?.map?.selectedPoi;
  if (!selectedPoi?.name) {
    return null;
  }
  return {
    name: selectedPoi.name,
    lat: selectedPoi.lat,
    lon: selectedPoi.lon,
    category: selectedPoi.category,
    score: toFiniteNumber(selectedPoi.score) ?? toFiniteNumber(currentPlan?.feasibility?.score) ?? 0,
    riskLabel: selectedPoi.riskLabel || currentPlan?.feasibility?.riskLabel || "Medium",
    feasible:
      typeof selectedPoi.feasible === "boolean"
        ? selectedPoi.feasible
        : Boolean(currentPlan?.feasibility?.feasible),
    slackMinutes:
      toFiniteNumber(selectedPoi.slackMinutes) ??
      toFiniteNumber(currentPlan?.feasibility?.slackMinutes) ??
      0,
    outboundMinutes: selectedPoi.outboundMinutes,
    inboundMinutes: selectedPoi.inboundMinutes,
    dwellMinutes: selectedPoi.dwellMinutes,
    selected: true,
  };
}

function travelMinutes(candidate) {
  const outbound = toFiniteNumber(candidate?.outboundMinutes);
  const inbound = toFiniteNumber(candidate?.inboundMinutes);
  if (outbound == null || inbound == null) {
    return null;
  }
  return outbound + inbound;
}

function compareCandidates(a, b) {
  const aFeasible = a?.feasible === true;
  const bFeasible = b?.feasible === true;
  if (aFeasible !== bFeasible) {
    return aFeasible ? -1 : 1;
  }

  const riskDelta =
    (RISK_ORDER[normalizeRiskLabel(a?.riskLabel)] ?? RISK_ORDER.neutral) -
    (RISK_ORDER[normalizeRiskLabel(b?.riskLabel)] ?? RISK_ORDER.neutral);
  if (riskDelta !== 0) {
    return riskDelta;
  }

  return (b?.score || 0) - (a?.score || 0);
}

function buildMetricDelta(activeCandidate, baselineCandidate) {
  if (!activeCandidate || !baselineCandidate) {
    return null;
  }
  if (candidateNamesMatch(activeCandidate.name, baselineCandidate.name)) {
    return null;
  }

  const activeSlack = toFiniteNumber(activeCandidate.slackMinutes);
  const baseSlack = toFiniteNumber(baselineCandidate.slackMinutes);
  const activeTravel = toFiniteNumber(travelMinutes(activeCandidate));
  const baseTravel = toFiniteNumber(travelMinutes(baselineCandidate));
  const activeDwell = toFiniteNumber(activeCandidate.dwellMinutes);
  const baseDwell = toFiniteNumber(baselineCandidate.dwellMinutes);

  return {
    slack:
      activeSlack != null && baseSlack != null ? Math.round(activeSlack - baseSlack) : null,
    travel:
      activeTravel != null && baseTravel != null
        ? Math.round(activeTravel - baseTravel)
        : null,
    dwell:
      activeDwell != null && baseDwell != null ? Math.round(activeDwell - baseDwell) : null,
  };
}

function formatSignedMinutes(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} min`;
}

function deltaTone(value, { higherIsBetter = true } = {}) {
  if (!Number.isFinite(value)) {
    return "neutral";
  }
  if (value === 0) {
    return "neutral";
  }
  const isGood = higherIsBetter ? value > 0 : value < 0;
  return isGood ? "good" : "warn";
}

function buildCandidateInsights(candidate, summary) {
  const pros = [];
  const cons = [];
  const riskClass = normalizeRiskLabel(candidate?.riskLabel);
  const feasible = candidate?.feasible === true;
  const slack = toFiniteNumber(candidate?.slackMinutes);
  const travel = travelMinutes(candidate);
  const dwell = toFiniteNumber(candidate?.dwellMinutes);
  const oneWayThreshold = toFiniteNumber(summary?.maxTravelMinutesOneWay);

  if (feasible) {
    pros.push("Feasible return window for the current layover.");
  } else {
    cons.push("Not feasibility-safe for this current window.");
  }

  if (slack != null && slack >= 45) {
    pros.push(`Strong slack buffer (${formatMinutes(slack)}).`);
  } else if (slack != null && slack >= 20) {
    pros.push(`Moderate slack buffer (${formatMinutes(slack)}).`);
  } else if (slack != null) {
    cons.push(`Low slack buffer (${formatMinutes(slack)}).`);
  }

  if (travel != null && oneWayThreshold != null) {
    const halfTravel = Math.round(travel / 2);
    if (halfTravel <= oneWayThreshold) {
      pros.push(`Travel time stays within the recommended threshold (${halfTravel} min one-way).`);
    } else {
      cons.push(`Travel time exceeds the recommended one-way threshold (${halfTravel} min vs ${oneWayThreshold} min).`);
    }
  }

  if (dwell != null && dwell >= 45) {
    pros.push(`Meaningful dwell window (${formatMinutes(dwell)}).`);
  } else if (dwell != null && dwell < 30) {
    cons.push(`Short dwell window (${formatMinutes(dwell)}).`);
  }

  if (riskClass === "high") {
    cons.push("High-risk classification due to limited margin or travel risk.");
  } else if (riskClass === "low") {
    pros.push("Low-risk classification based on current constraints.");
  }

  if (pros.length === 0) {
    pros.push("Balanced tradeoff for this airport/time window.");
  }
  if (cons.length === 0) {
    cons.push("No major downside flagged for current constraints.");
  }

  let statusLabel = "Caution";
  let statusTone = "caution";
  if (feasible && riskClass === "low") {
    statusLabel = "Best Fit";
    statusTone = "best";
  } else if (!feasible || riskClass === "high") {
    statusLabel = "High Risk";
    statusTone = "high";
  }

  return {
    pros,
    cons,
    statusLabel,
    statusTone,
  };
}

function buildNarrative({
  candidate,
  insights,
  airportCode,
  isPendingSelection,
  fallbackNarrative,
  isPersistedSelection,
}) {
  if (!candidate) {
    return fallbackNarrative;
  }

  if (isPersistedSelection && !isPendingSelection) {
    return fallbackNarrative;
  }

  const travel = travelMinutes(candidate);
  const travelText = travel != null ? formatMinutes(travel) : "-";
  const dwellText = formatMinutes(candidate?.dwellMinutes);
  const slackText = formatMinutes(candidate?.slackMinutes);

  const prefix = isPendingSelection
    ? `Updating itinerary to ${candidate.name} for ${airportCode || "this airport"}.`
    : `Comparing ${candidate.name} at ${airportCode || "this airport"}.`;

  return `${prefix} Travel ${travelText}, dwell ${dwellText}, projected slack ${slackText}. ${insights.pros[0]} ${insights.cons[0]}`;
}

function parseDateSafe(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMinutesSafe(date, minutes) {
  const base = parseDateSafe(date);
  if (!base || !Number.isFinite(minutes)) {
    return null;
  }
  return new Date(base.getTime() + minutes * 60000);
}

function formatScheduleStamp(value) {
  const date = parseDateSafe(value);
  if (!date) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alignScheduleToCandidate(schedule, fromName, toName) {
  if (!Array.isArray(schedule) || !schedule.length) {
    return [];
  }
  if (!fromName || !toName || candidateNamesMatch(fromName, toName)) {
    return schedule;
  }

  const fromPattern = new RegExp(escapeRegExp(fromName), "gi");

  return schedule.map((item) => {
    const locationMatches = candidateNamesMatch(item?.location, fromName);
    const location = locationMatches ? toName : item.location;
    const label =
      typeof item?.label === "string" ? item.label.replace(fromPattern, toName) : item?.label;
    return {
      ...item,
      label,
      location,
      source: item?.source || "aligned",
    };
  });
}

function buildPreviewSchedule(currentPlan, candidate) {
  const arrivalTime = parseDateSafe(currentPlan?.request?.arrivalTime);
  const departureTime = parseDateSafe(currentPlan?.request?.departureTime);
  const processingMinutes = toFiniteNumber(currentPlan?.summary?.processingMinutes);
  const returnBufferMinutes = toFiniteNumber(currentPlan?.summary?.returnBufferMinutes);
  const outboundMinutes = toFiniteNumber(candidate?.outboundMinutes);
  const inboundMinutes = toFiniteNumber(candidate?.inboundMinutes);
  const dwellMinutes = toFiniteNumber(candidate?.dwellMinutes);
  const airportName = currentPlan?.airport?.name || currentPlan?.map?.airport?.name || "Airport";
  const airportCode = currentPlan?.airport?.code || currentPlan?.map?.airport?.code || "Airport";
  const poiName = candidate?.name || currentPlan?.map?.selectedPoi?.name || "Selected stop";

  if (
    !arrivalTime ||
    !departureTime ||
    processingMinutes == null ||
    returnBufferMinutes == null ||
    outboundMinutes == null ||
    inboundMinutes == null ||
    dwellMinutes == null
  ) {
    return null;
  }

  const leaveAirportAt = addMinutesSafe(arrivalTime, processingMinutes);
  const arrivePoiAt = addMinutesSafe(leaveAirportAt, outboundMinutes);
  const leavePoiAt = addMinutesSafe(arrivePoiAt, dwellMinutes);
  const backAtAirportAt = addMinutesSafe(leavePoiAt, inboundMinutes);
  const recommendedTerminalReturnAt = addMinutesSafe(backAtAirportAt, returnBufferMinutes);

  if (
    !leaveAirportAt ||
    !arrivePoiAt ||
    !leavePoiAt ||
    !backAtAirportAt ||
    !recommendedTerminalReturnAt
  ) {
    return null;
  }

  return [
    {
      label: "Arrive and clear airport processing",
      start: formatScheduleStamp(arrivalTime),
      end: formatScheduleStamp(leaveAirportAt),
      minutes: processingMinutes,
      location: airportName,
      source: "preview",
    },
    {
      label: `Travel to ${poiName}`,
      start: formatScheduleStamp(leaveAirportAt),
      end: formatScheduleStamp(arrivePoiAt),
      minutes: outboundMinutes,
      location: poiName,
      source: "preview",
    },
    {
      label: `Explore ${poiName}`,
      start: formatScheduleStamp(arrivePoiAt),
      end: formatScheduleStamp(leavePoiAt),
      minutes: dwellMinutes,
      location: poiName,
      source: "preview",
    },
    {
      label: `Return to ${airportCode}`,
      start: formatScheduleStamp(leavePoiAt),
      end: formatScheduleStamp(backAtAirportAt),
      minutes: inboundMinutes,
      location: airportName,
      source: "preview",
    },
    {
      label: "Recommended airport buffer before departure",
      start: formatScheduleStamp(backAtAirportAt),
      end: formatScheduleStamp(recommendedTerminalReturnAt),
      minutes: returnBufferMinutes,
      location: airportName,
      source: "preview",
    },
    {
      label: "Ready for departing flight",
      start: formatScheduleStamp(recommendedTerminalReturnAt),
      end: formatScheduleStamp(departureTime),
      minutes: Math.max(
        0,
        Math.round((departureTime.getTime() - recommendedTerminalReturnAt.getTime()) / 60000)
      ),
      location: airportName,
      source: "preview",
    },
  ];
}

export default function ResultsArea({
  currentPlan,
  isLoading,
  flightStatus,
  replanHistory,
  pendingCandidateName,
  activeCandidateName,
  onSelectCandidate,
}) {
  const [activeTab, setActiveTab] = useState("decision");
  const tabIds = {
    decision: "results-tab-decision",
    timeline: "results-tab-timeline",
    map: "results-tab-map",
  };
  const panelIds = {
    decision: "results-panel-decision",
    timeline: "results-panel-timeline",
    map: "results-panel-map",
  };
  const [placePreview, setPlacePreview] = useState(null);
  const [isPlacePreviewLoading, setIsPlacePreviewLoading] = useState(false);
  const [placePreviewError, setPlacePreviewError] = useState(null);

  const selectedCandidate = useMemo(
    () => buildSelectedCandidateFromPlan(currentPlan),
    [currentPlan]
  );
  const candidates = useMemo(() => {
    const baseCandidates = currentPlan?.map?.candidates || [];
    if (!selectedCandidate?.name) {
      return baseCandidates;
    }
    const hasSelectedInList = baseCandidates.some((candidate) =>
      candidateNamesMatch(candidate.name, selectedCandidate.name)
    );
    return hasSelectedInList ? baseCandidates : [selectedCandidate, ...baseCandidates];
  }, [currentPlan, selectedCandidate]);
  const sortedCandidates = useMemo(() => [...candidates].sort(compareCandidates), [candidates]);

  const selectedPoiName = currentPlan?.map?.selectedPoi?.name || "";
  const displayCandidateName = pendingCandidateName || activeCandidateName || selectedPoiName || "";
  const displayCandidate =
    sortedCandidates.find((candidate) =>
      candidateNamesMatch(candidate.name, displayCandidateName)
    ) ||
    sortedCandidates.find((candidate) => candidateNamesMatch(candidate.name, selectedPoiName)) ||
    sortedCandidates[0] ||
    null;
  const committedCandidate =
    sortedCandidates.find((candidate) => candidateNamesMatch(candidate.name, selectedPoiName)) ||
    selectedCandidate ||
    sortedCandidates[0] ||
    null;
  const summaryCandidate = displayCandidate || committedCandidate;
  const isChoiceOverride = Boolean(
    displayCandidate &&
      committedCandidate &&
      !candidateNamesMatch(displayCandidate.name, committedCandidate.name)
  );

  const isPendingSelection = Boolean(pendingCandidateName && isLoading);
  const fallbackRiskLabel = currentPlan?.feasibility?.riskLabel || "Medium";
  const riskClass = normalizeRiskLabel(summaryCandidate?.riskLabel || fallbackRiskLabel);
  const summaryFeasible =
    typeof summaryCandidate?.feasible === "boolean"
      ? summaryCandidate.feasible
      : Boolean(currentPlan?.feasibility?.feasible);
  const summaryScore =
    toFiniteNumber(summaryCandidate?.score) ?? toFiniteNumber(currentPlan?.feasibility?.score) ?? 0;
  const summarySlack =
    toFiniteNumber(summaryCandidate?.slackMinutes) ??
    toFiniteNumber(currentPlan?.feasibility?.slackMinutes) ??
    0;
  const summaryTitle =
    summaryCandidate?.name ||
    currentPlan?.ai?.title ||
    currentPlan?.map?.selectedPoi?.name ||
    "In-Airport Layover Plan";

  const displayInsights = buildCandidateInsights(summaryCandidate, currentPlan?.summary);
  const summaryNarrative = buildNarrative({
    candidate: summaryCandidate,
    insights: displayInsights,
    airportCode: currentPlan?.request?.airportCode,
    isPendingSelection,
    fallbackNarrative: currentPlan?.narrative,
    isPersistedSelection:
      candidateNamesMatch(summaryCandidate?.name, selectedPoiName) && !isChoiceOverride,
  });

  const planTitle = summaryTitle;
  const decisionText = summaryFeasible
    ? "GO: Off-airport window still feasible."
    : "NO-GO: Stay-airport guidance remains safest.";
  const generatedAtLabel = currentPlan?.meta?.generatedAt
    ? formatDateTime(currentPlan.meta.generatedAt)
    : formatDateTime(new Date());
  const selectedByLabel = isChoiceOverride
    ? "Previewing user selection"
    : currentPlan?.selection?.selectedBy === "user-preference"
      ? "User selection applied"
      : currentPlan?.selection?.selectedBy === "system-ranking"
        ? "System ranked selection"
        : "No off-airport selection";
  const engineLatency =
    Number.isFinite(currentPlan?.observability?.generatedInMs)
      ? `${currentPlan.observability.generatedInMs}ms`
      : "n/a";
  const aiInfo = currentPlan?.ai || null;
  const aiBadge = aiInfo?.used
    ? {
        text: `AI: ${aiInfo.provider} ${aiInfo.model}${
          Number.isFinite(aiInfo.latencyMs) ? ` · ${aiInfo.latencyMs}ms` : ""
        }`,
        title: "Live LLM call",
        tone: "ai-on",
      }
    : {
        text: "AI: fallback (no LLM)",
        title: aiInfo?.error || "LLM not configured",
        tone: "ai-off",
      };
  const travelerTips = Array.isArray(aiInfo?.travelerTips) ? aiInfo.travelerTips : [];
  const aiRiskExplainer = aiInfo?.riskExplainer || null;
  const aiSelectionRationale = aiInfo?.selectionRationale || null;
  const aiPickedByLlm = currentPlan?.selection?.selectedBy === "ai-ranking";
  const candidateBlurbs = aiInfo?.candidateBlurbs || {};
  const summaryCandidateBlurb = summaryCandidate?.name ? candidateBlurbs[summaryCandidate.name] : null;

  const actionPoi = summaryCandidate || currentPlan?.map?.selectedPoi || null;
  const isSelectedByUser = currentPlan?.selection?.selectedBy === "user-preference";
  const mapFocusCandidate = displayCandidate || summaryCandidate || null;
  const mapFocusName = mapFocusCandidate?.name || null;
  const baselineCandidate = sortedCandidates[0] || null;
  const metricDelta = buildMetricDelta(displayCandidate, baselineCandidate);
  const previewSchedule = useMemo(
    () => buildPreviewSchedule(currentPlan, summaryCandidate),
    [currentPlan, summaryCandidate]
  );
  const timelineSchedule =
    isChoiceOverride && Array.isArray(previewSchedule) && previewSchedule.length > 0
      ? previewSchedule
      : isChoiceOverride
        ? alignScheduleToCandidate(
            currentPlan?.schedule || [],
            committedCandidate?.name || selectedPoiName,
            summaryCandidate?.name
          )
      : currentPlan?.schedule || [];
  const timelineCount = timelineSchedule.length;

  useEffect(() => {
    const lat = toFiniteNumber(summaryCandidate?.lat);
    const lon = toFiniteNumber(summaryCandidate?.lon);
    const name = String(summaryCandidate?.name || "").trim();
    if (!name || lat == null || lon == null) {
      setPlacePreview(null);
      setPlacePreviewError(null);
      setIsPlacePreviewLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setIsPlacePreviewLoading(true);
    setPlacePreviewError(null);

    fetch(
      `/api/place-preview?name=${encodeURIComponent(name)}&lat=${lat}&lon=${lon}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || "Place preview unavailable");
        }
        return response.json();
      })
      .then((data) => {
        setPlacePreview(data?.preview || null);
      })
      .catch((error) => {
        if (error?.name === "AbortError") {
          return;
        }
        setPlacePreview(null);
        setPlacePreviewError(error.message || "Place preview unavailable");
      })
      .finally(() => {
        setIsPlacePreviewLoading(false);
      });

    return () => controller.abort();
  }, [summaryCandidate?.name, summaryCandidate?.lat, summaryCandidate?.lon]);

  const handleCandidateClick = (candidate) => {
    if (!candidate?.name || !onSelectCandidate) {
      return;
    }
    if (candidateNamesMatch(candidate.name, displayCandidate?.name)) {
      return;
    }
    onSelectCandidate(candidate);
  };

  if (isLoading && !currentPlan) {
    return (
      <section className="results">
        <motion.article
          className="card skeleton-card"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="skeleton-head">
            <div className="skeleton-line skeleton-title"></div>
            <div className="skeleton-pill"></div>
          </div>
          <div className="skeleton-banner"></div>
          <div className="skeleton-grid">
            <div className="skeleton-line"></div>
            <div className="skeleton-line"></div>
            <div className="skeleton-line"></div>
          </div>
          <div className="skeleton-block"></div>
        </motion.article>
      </section>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!currentPlan ? (
        <motion.section
          key="empty"
          className="results results--empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <article className="card empty-state-card reveal">
            <div className="empty-state-content">
              <div className="empty-state-hero">
                <p className="eyebrow">Before You Generate</p>
                <h2>Build one layover plan and compare the safest options in one surface.</h2>
                <p>
                  Set the airport, arrival window, and travel style on the left. LayoverPlus will
                  score nearby stops, explain the tradeoffs, and keep the decision, timeline, map,
                  and place preview aligned when you switch choices.
                </p>
              </div>

              <div className="empty-kpi-grid">
                <div className="empty-kpi">
                  <span>Best Stop</span>
                  <strong>Risk-Scored Recommendation</strong>
                </div>
                <div className="empty-kpi">
                  <span>Trip Timing</span>
                  <strong>Timeline + Safety Buffer</strong>
                </div>
                <div className="empty-kpi">
                  <span>Place Context</span>
                  <strong>Map + Photos + Reviews</strong>
                </div>
              </div>

              <div className="empty-launch-options">
                <p className="mini-label">What Your Plan Includes</p>
                <div className="empty-option-grid">
                  <article className="empty-option-card">
                    <h3>Safer alternative ranking</h3>
                    <p>Compare nearby stops by score, slack buffer, travel time, and risk explanation.</p>
                    <span>Choice comparison</span>
                  </article>
                  <article className="empty-option-card">
                    <h3>Synced timeline and route</h3>
                    <p>See when to leave, how long to stay, and how much buffer remains before departure.</p>
                    <span>Timing model</span>
                  </article>
                  <article className="empty-option-card">
                    <h3>Place preview before you go</h3>
                    <p>Inspect the stop on a map, open it in Apple or Google Maps, and review the place context.</p>
                    <span>Preview surface</span>
                  </article>
                </div>
              </div>

              <div className="empty-flow">
                <p className="mini-label">How To Use It</p>
                <ol>
                  <li>
                    <strong>Set your airport and layover window</strong>
                    <span>Use a quick-start template or enter your own arrival and departure times.</span>
                  </li>
                  <li>
                    <strong>Generate and compare options</strong>
                    <span>Choose the safest stop or inspect alternatives with clear upsides and downsides.</span>
                  </li>
                  <li>
                    <strong>Open maps, rides, or save the result</strong>
                    <span>Move from plan to action without losing the timing and risk context.</span>
                  </li>
                </ol>
              </div>

              <div className="empty-signals">
                <span className="empty-pill">Feasibility scoring</span>
                <span className="empty-pill">Live choice sync</span>
                <span className="empty-pill">Map auto-focus</span>
                <span className="empty-pill">Place preview links</span>
              </div>
            </div>
          </article>
        </motion.section>
      ) : (
        <motion.section
          key="results"
          id="results-top"
          className="results"
          aria-busy={isLoading ? "true" : "false"}
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <motion.article variants={itemVariants} className="card summary-card reveal">
            <div className="summary-head">
              <div>
                <span className="eyebrow">Primary Recommendation</span>
                <h2>{summaryTitle}</h2>
                {isSelectedByUser && (
                  <p className="candidate-selection-note">
                    Custom option selected from alternatives.
                  </p>
                )}
                {isChoiceOverride && !isPendingSelection && (
                  <p className="candidate-selection-note">
                    Comparing live preview for {summaryCandidate?.name}.
                  </p>
                )}
                {isPendingSelection && (
                  <p className="pending-choice-note">
                    Updating itinerary to {pendingCandidateName}...
                  </p>
                )}
              </div>
              <div className="risk-indicator">
                <span className="mini-label">System Assessment</span>
                <div className={`risk-pulse ${riskClass}`}>
                  <span className="pulse-dot"></span>
                  <span className="mono">{riskClass.toUpperCase()} RISK</span>
                </div>
                {aiRiskExplainer && (
                  <p className="risk-explainer">{aiRiskExplainer}</p>
                )}
              </div>
            </div>

            <div className={`decision-strip ${summaryFeasible ? "go" : "no-go"}`}>
              <span className="icon">{summaryFeasible ? "✓" : "⚠"}</span>
              <p>
                {summaryFeasible
                  ? "Safe off-airport window detected."
                  : "High risk detected. In-airport stay recommended."}
              </p>
            </div>

            {aiPickedByLlm && aiSelectionRationale && (
              <p className="ai-rationale">
                <span className="ai-rationale-label">AI pick:</span> {aiSelectionRationale}
              </p>
            )}
            {isPendingSelection && (
              <p className="pending-panel-note">
                Decision, timeline, and map will refresh together once the new choice is applied.
              </p>
            )}

            {sortedCandidates.length > 0 && (
              <section className="candidate-section">
                <p className="mini-label">Compare Alternative Stops</p>
                <p className="candidate-rank-note">
                  Ranked safest-first for current timing. {sortedCandidates.length} options available.
                </p>
                {metricDelta && baselineCandidate && (
                  <div className="candidate-delta-card">
                    <p className="mono candidate-delta-label">
                      Compared with safest option: {baselineCandidate.name}
                    </p>
                    <div className="candidate-delta-grid">
                      <div className={`candidate-delta-pill ${deltaTone(metricDelta.slack, { higherIsBetter: true })}`}>
                        Slack {formatSignedMinutes(metricDelta.slack)}
                      </div>
                      <div className={`candidate-delta-pill ${deltaTone(metricDelta.travel, { higherIsBetter: false })}`}>
                        Travel {formatSignedMinutes(metricDelta.travel)}
                      </div>
                      <div className={`candidate-delta-pill ${deltaTone(metricDelta.dwell, { higherIsBetter: true })}`}>
                        Dwell {formatSignedMinutes(metricDelta.dwell)}
                      </div>
                    </div>
                  </div>
                )}
                <div className="candidate-workbench">
                  <div className="candidate-list">
                    {sortedCandidates.map((candidate, index) => {
                      const candidateInsights = buildCandidateInsights(candidate, currentPlan?.summary);
                      const isActive = candidateNamesMatch(candidate.name, displayCandidate?.name);
                      const riskTone = normalizeRiskLabel(candidate.riskLabel);

                      return (
                        <button
                          key={`${candidate.name}-${candidate.lat}-${candidate.lon}`}
                          type="button"
                          className={`candidate-item ${isActive ? "active" : ""}`}
                          onClick={() => handleCandidateClick(candidate)}
                          aria-pressed={isActive}
                        >
                          <div className="candidate-card-head">
                            <p className="candidate-title">
                              {candidate.name}
                              {isActive ? <span className="candidate-current-tag">Selected</span> : null}
                            </p>
                            <span className={`candidate-status-mini ${candidateInsights.statusTone}`}>
                              {candidateInsights.statusLabel}
                            </span>
                          </div>
                          <p className="candidate-rank">
                            Rank {index + 1} of {sortedCandidates.length}
                          </p>
                          <p className="candidate-meta">
                            {(candidate.category || "Point of interest").replaceAll("_", " ")} · Score{" "}
                            {candidate.score}/100 · Slack {formatMinutes(candidate.slackMinutes)}
                          </p>
                          {candidate.address ? (
                            <p className="candidate-meta-address">{candidate.address}</p>
                          ) : null}
                          <div className="candidate-score-row">
                            <span className={`risk-chip ${riskTone}`}>{String(candidate.riskLabel || "Medium").toUpperCase()}</span>
                            <span className="mono">
                              Travel {formatMinutes(travelMinutes(candidate))} · Dwell {formatMinutes(candidate.dwellMinutes)}
                            </span>
                          </div>
                          <div className="candidate-bullet-grid">
                            <p>
                              <strong>Upside:</strong> {candidateInsights.pros[0]}
                            </p>
                            <p>
                              <strong>Downside:</strong> {candidateInsights.cons[0]}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="candidate-preview-map">
                    <Map
                      currentPlan={currentPlan}
                      highlightCandidate={mapFocusCandidate}
                      highlightCandidateName={mapFocusName}
                      compact
                      invalidateTrigger={`${activeTab}:${mapFocusName || "none"}:${isPendingSelection ? "pending" : "ready"}`}
                    />
                  </div>
                </div>
              </section>
            )}

            {summaryCandidate && (
              <section className="place-preview-panel">
                <div className="place-preview-head">
                  <p className="mini-label">Place Preview</p>
                  <h3>{summaryCandidate.name}</h3>
                </div>
                {isPlacePreviewLoading ? (
                  <p className="candidate-preview-note">Loading place details and reviews...</p>
                ) : (
                  <>
                    <p className="place-preview-address">
                      {placePreview?.place?.address || summaryCandidate?.address || "Address unavailable."}
                    </p>
                    <div className="place-preview-meta">
                      <span>
                        Rating:{" "}
                        {Number.isFinite(placePreview?.place?.rating)
                          ? `${placePreview.place.rating.toFixed(1)} / 5`
                          : "n/a"}
                      </span>
                      <span>
                        Reviews:{" "}
                        {Number.isFinite(placePreview?.place?.reviewCount)
                          ? placePreview.place.reviewCount
                          : "n/a"}
                      </span>
                      <span>
                        Source:{" "}
                        {placePreview?.provider === "google"
                          ? "Google Places"
                          : placePreview?.provider === "yelp"
                            ? "Yelp"
                            : "Maps links"}
                      </span>
                      {placePreview?.yelp?.rating != null ? (
                        <span>
                          Yelp: {placePreview.yelp.rating.toFixed(1)} / 5 ({placePreview.yelp.reviewCount || 0})
                        </span>
                      ) : null}
                    </div>
                    {Array.isArray(placePreview?.photos) && placePreview.photos.length > 0 ? (
                      <div className="place-photo-grid">
                        {placePreview.photos.slice(0, 4).map((photo) => (
                          <figure key={photo.id || photo.url} className="place-photo-card">
                            <img
                              src={photo.url}
                              alt={`${summaryCandidate.name} preview`}
                              loading="lazy"
                            />
                            <figcaption>{photo.provider === "yelp" ? "Yelp photo" : "Map photo"}</figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <p className="candidate-preview-note">
                        No photo preview available yet for this place.
                      </p>
                    )}
                    {placePreview?.yelp ? (
                      <div className="place-yelp-card">
                        <p className="place-yelp-title">Yelp snapshot</p>
                        <p>
                          {placePreview.yelp.name || summaryCandidate.name}
                          {placePreview.yelp.priceLevel ? ` · ${placePreview.yelp.priceLevel}` : ""}
                        </p>
                        {Array.isArray(placePreview.yelp.categories) &&
                        placePreview.yelp.categories.length > 0 ? (
                          <p className="place-yelp-categories">
                            {placePreview.yelp.categories.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="place-preview-links">
                      {(() => {
                        const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
                        const preferApple = /iPhone|iPad|iPod|Macintosh|Mac OS X/.test(ua);
                        const mapsHref = preferApple
                          ? placePreview?.links?.appleMaps || placePreview?.links?.googleMaps
                          : placePreview?.links?.googleMaps || placePreview?.links?.appleMaps;
                        return mapsHref ? (
                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ride-open-btn"
                          >
                            Open in Maps
                          </a>
                        ) : null;
                      })()}
                      {placePreview?.links?.yelp && (
                        <a
                          href={placePreview.links.yelp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ride-open-btn"
                        >
                          Open on Yelp
                        </a>
                      )}
                    </div>
                    {Array.isArray(placePreview?.reviews) && placePreview.reviews.length > 0 ? (
                      <div className="place-review-list">
                        {placePreview.reviews.slice(0, 3).map((review, index) => (
                          <article key={`${review.source || "src"}-${review.author}-${index}`} className="place-review-item">
                            <p className="place-review-head">
                              <strong>{review.author}</strong>
                              <span>
                                {review.source === "yelp" ? "Yelp" : "Google"} ·{" "}
                                {Number.isFinite(review.rating) ? `${review.rating}/5` : "n/a"}
                              </span>
                            </p>
                            <p>{review.text}</p>
                            {review.sourceUrl ? (
                              <a
                                href={review.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="place-review-link"
                              >
                                View source
                              </a>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="candidate-preview-note">
                        {placePreviewError
                          ? `Reviews unavailable: ${placePreviewError}`
                          : "No live review text returned for this location yet."}
                      </p>
                    )}
                  </>
                )}
              </section>
            )}

            {actionPoi && (
              <div className="action-center">
                <p className="mini-label">Ride Options</p>
                <div className="ride-compare-grid">
                  <article className="ride-option-card uber">
                    <div className="ride-option-head">
                      <span className="ride-brand">Uber</span>
                      <span className="ride-pill">Direct link</span>
                    </div>
                    <p className="ride-destination">Destination: {actionPoi.name}</p>
                    <p className="ride-helper">
                      ETA and fare shown in Uber app. Estimated travel: {formatMinutes(travelMinutes(actionPoi))}.
                    </p>
                    <a
                      href={`https://m.uber.com/ul/?action=setPickup&pickup=my_location&destination[latitude]=${actionPoi.lat}&destination[longitude]=${actionPoi.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ride-open-btn"
                    >
                      Open Uber
                    </a>
                  </article>

                  <article className="ride-option-card lyft">
                    <div className="ride-option-head">
                      <span className="ride-brand">Lyft</span>
                      <span className="ride-pill">Direct link</span>
                    </div>
                    <p className="ride-destination">Destination: {actionPoi.name}</p>
                    <p className="ride-helper">
                      ETA and fare shown in Lyft app. Estimated travel: {formatMinutes(travelMinutes(actionPoi))}.
                    </p>
                    <a
                      href={`https://lyft.com/ride?id=lyft&destination[latitude]=${actionPoi.lat}&destination[longitude]=${actionPoi.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ride-open-btn"
                    >
                      Open Lyft
                    </a>
                  </article>
                </div>
                {!isPendingSelection ? (
                  <ShareCenter currentPlan={currentPlan} />
                ) : (
                  <p className="candidate-preview-note">
                    Finish refresh before sharing this regenerated itinerary.
                  </p>
                )}
              </div>
            )}
          </motion.article>

          {flightStatus && (
            <motion.article variants={itemVariants} className="card flight-pulse reveal">
              <div className="summary-head">
                <div>
                  <span className="eyebrow">Selected Plan</span>
                  <h2>{planTitle}</h2>
                </div>
                <div className="decision-pill">
                  <span className="mini-label">Safety Call</span>
                  <div className={`decision-banner ${summaryFeasible ? "go" : "no-go"}`}>
                    {decisionText}
                  </div>
                </div>
              </div>
              <p className="mono">
                Gate: {flightStatus.gate || "TBD"} · Delay: {flightStatus.delayMinutes}m
              </p>
              <p className="summary-meta-line">
                Applied stop: {summaryCandidate?.name || "In-airport"} · Source: {selectedByLabel}
              </p>
              {isPendingSelection && (
                <p className="pending-panel-note">
                  Pending change: {pendingCandidateName}. This summary will update after apply completes.
                </p>
              )}
              {replanHistory?.length > 0 && (
                <details className="replan-history">
                  <summary>Replan History ({replanHistory.length})</summary>
                  <ul className="mini-timeline">
                    {replanHistory.map((historyItem, index) => (
                      <li key={`${historyItem.trigger}-${historyItem.at}-${index}`}>
                        {historyItem.trigger}: {historyItem.reason} ({formatDateTime(historyItem.at)})
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </motion.article>
          )}

          <motion.nav variants={itemVariants} className="result-tabs reveal" role="tablist">
            <button
              id={tabIds.decision}
              role="tab"
              aria-selected={activeTab === "decision"}
              aria-controls={panelIds.decision}
              className={`tab-btn ${activeTab === "decision" ? "active" : ""}`}
              onClick={() => setActiveTab("decision")}
            >
              Overview
            </button>
            <button
              id={tabIds.timeline}
              role="tab"
              aria-selected={activeTab === "timeline"}
              aria-controls={panelIds.timeline}
              className={`tab-btn ${activeTab === "timeline" ? "active" : ""}`}
              onClick={() => setActiveTab("timeline")}
            >
              Timeline ({timelineCount})
            </button>
            <button
              id={tabIds.map}
              role="tab"
              aria-selected={activeTab === "map"}
              aria-controls={panelIds.map}
              className={`tab-btn ${activeTab === "map" ? "active" : ""}`}
              onClick={() => setActiveTab("map")}
            >
              Map
            </button>
          </motion.nav>

          <motion.div variants={itemVariants} className="panel-container">
            <AnimatePresence mode="wait">
              {activeTab === "decision" && (
                <motion.article
                  id={panelIds.decision}
                  role="tabpanel"
                  aria-labelledby={tabIds.decision}
                  key="decision"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="card reveal tab-panel active"
                >
                  <div className="summary-head">
                    <div>
                      <h2>Trip snapshot</h2>
                      <p className="tab-intro">
                        Core timing and safety metrics for the active stop.
                      </p>
                      {summaryCandidate?.name && (
                        <p className="summary-meta-line">Active stop: {summaryCandidate.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="summary-grid">
                    <div>
                      <span>Score</span>
                      <strong>{summaryScore}</strong>
                    </div>
                    <div>
                      <span>Layover</span>
                      <strong>{formatDuration(currentPlan.summary.layoverMinutes)}</strong>
                    </div>
                    <div>
                      <span>Processing</span>
                      <strong>{formatMinutes(currentPlan.summary.processingMinutes)}</strong>
                    </div>
                    <div>
                      <span>Buffer</span>
                      <strong>{formatMinutes(currentPlan.summary.returnBufferMinutes)}</strong>
                    </div>
                    <div>
                      <span>Slack</span>
                      <strong>{formatMinutes(summarySlack)}</strong>
                    </div>
                    <div>
                      <span>Risk</span>
                      <strong>{riskClass.toUpperCase()}</strong>
                    </div>
                  </div>

                  <p className="summary-meta-line">
                    {selectedByLabel} · Engine: {engineLatency}
                    {" · "}
                    <span className={`ai-badge ${aiBadge.tone}`} title={aiBadge.title}>
                      {aiBadge.text}
                    </span>
                  </p>

                  <p className="narrative">{summaryNarrative}</p>

                  {summaryCandidate && (
                    <section className="candidate-compare-detail">
                      <div className="candidate-status-row">
                        <span className={`candidate-status-badge ${displayInsights.statusTone}`}>
                          {displayInsights.statusLabel}
                        </span>
                        <span className="candidate-status-meta mono">
                          Travel {formatMinutes(travelMinutes(summaryCandidate))} · Dwell{" "}
                          {formatMinutes(summaryCandidate?.dwellMinutes)}
                        </span>
                      </div>
                      {summaryCandidateBlurb && (
                        <p className="candidate-blurb">{summaryCandidateBlurb}</p>
                      )}
                      <div className="candidate-tradeoff-grid">
                        <div className="candidate-tradeoff pros">
                          <h4>Upsides</h4>
                          <ul>
                            {displayInsights.pros.slice(0, 3).map((insight) => (
                              <li key={insight}>{insight}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="candidate-tradeoff cons">
                          <h4>Downsides</h4>
                          <ul>
                            {displayInsights.cons.slice(0, 3).map((insight) => (
                              <li key={insight}>{insight}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </section>
                  )}

                  {travelerTips.length > 0 && (
                    <div className="traveler-tips">
                      <h4>Traveler tips</h4>
                      <ul>
                        {travelerTips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.article>
              )}

              {activeTab === "timeline" && (
                <motion.article
                  id={panelIds.timeline}
                  role="tabpanel"
                  aria-labelledby={tabIds.timeline}
                  key="timeline"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="card reveal tab-panel active"
                >
                  <h2>Timeline</h2>
                  <p className="tab-intro">
                    Departure-safe sequence for the currently applied stop.
                  </p>
                  {isChoiceOverride && (
                    <p className="pending-panel-note">
                      Previewing timeline for {summaryCandidate?.name}. It will be finalized when sync completes.
                    </p>
                  )}
                  <div className="timeline">
                    {timelineSchedule.map((item, idx) => (
                      <div
                        key={`${item.label}-${idx}`}
                        className={`timeline-item ${item?.source === "preview" ? "preview" : ""}`}
                      >
                        <div className="time-range">
                          {item.start} - {item.end}
                        </div>
                        <div className="timeline-main">
                          <strong>{item.label}</strong>
                          <span>{item.location}</span>
                        </div>
                        <div className="timeline-duration">{formatMinutes(item.minutes)}</div>
                      </div>
                    ))}
                  </div>
                </motion.article>
              )}

              {activeTab === "map" && (
                <motion.article
                  id={panelIds.map}
                  role="tabpanel"
                  aria-labelledby={tabIds.map}
                  key="map"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="card reveal tab-panel active"
                >
                  <h2>Map view</h2>
                  <p className="tab-intro">
                    Auto-focused route between the airport and the active destination.
                  </p>
                  {isPendingSelection && (
                    <p className="pending-panel-note">
                      Refreshing map for {pendingCandidateName}. Route will update when the applied result returns.
                    </p>
                  )}
                  <Map
                    currentPlan={currentPlan}
                    highlightCandidate={mapFocusCandidate}
                    highlightCandidateName={mapFocusName}
                    invalidateTrigger={`${activeTab}:${mapFocusName || "none"}:${isPendingSelection ? "pending" : "ready"}`}
                  />
                </motion.article>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
