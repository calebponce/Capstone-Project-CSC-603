import React, { useMemo, useState } from "react";
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
  const summaryCandidate = committedCandidate || displayCandidate;

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
    isPersistedSelection: candidateNamesMatch(summaryCandidate?.name, selectedPoiName),
  });

  const planTitle = summaryTitle;
  const decisionText = summaryFeasible
    ? "GO: Off-airport window still feasible."
    : "NO-GO: Stay-airport guidance remains safest.";
  const generatedAtLabel = currentPlan?.meta?.generatedAt
    ? formatDateTime(currentPlan.meta.generatedAt)
    : formatDateTime(new Date());
  const selectedByLabel =
    currentPlan?.selection?.selectedBy === "user-preference"
      ? "User selection applied"
      : currentPlan?.selection?.selectedBy === "system-ranking"
        ? "System ranked selection"
        : "No off-airport selection";
  const engineLatency =
    Number.isFinite(currentPlan?.observability?.generatedInMs)
      ? `${currentPlan.observability.generatedInMs}ms`
      : "n/a";

  const actionPoi = summaryCandidate || currentPlan?.map?.selectedPoi || null;
  const isSelectedByUser = currentPlan?.selection?.selectedBy === "user-preference";
  const mapFocusName = displayCandidate?.name || summaryCandidate?.name || null;
  const baselineCandidate = sortedCandidates[0] || null;
  const metricDelta = buildMetricDelta(displayCandidate, baselineCandidate);

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
                <p className="eyebrow">Ready For Takeoff</p>
                <h2>Your layover command center</h2>
                <p>
                  Build a timing-safe layover plan and instantly preview risk, route fit, and
                  fallback options before you leave the terminal.
                </p>
              </div>

              <div className="empty-kpi-grid">
                <div className="empty-kpi">
                  <span>Supported Airports</span>
                  <strong>3</strong>
                </div>
                <div className="empty-kpi">
                  <span>Risk Profiles</span>
                  <strong>3</strong>
                </div>
                <div className="empty-kpi">
                  <span>Strategy Packs</span>
                  <strong>4</strong>
                </div>
              </div>

              <div className="empty-launch-options">
                <p className="mini-label">Recommended Launch Options</p>
                <div className="empty-option-grid">
                  <article className="empty-option-card">
                    <h3>Food Sprint</h3>
                    <p>Short culinary layover with high-confidence travel timing.</p>
                    <span>SFO · +5h · Balanced</span>
                  </article>
                  <article className="empty-option-card">
                    <h3>Culture Stop</h3>
                    <p>Museum and landmark focus with moderate exploration time.</p>
                    <span>JFK · +6h · Balanced</span>
                  </article>
                  <article className="empty-option-card">
                    <h3>Scenic Window</h3>
                    <p>Conservative extended layover with buffer-first planning.</p>
                    <span>LAX · +8h · Conservative</span>
                  </article>
                </div>
              </div>

              <div className="empty-flow">
                <p className="mini-label">How This Works</p>
                <ol>
                  <li>
                    <strong>Define your layover window</strong>
                    <span>Arrival, departure, connection type, and airport context.</span>
                  </li>
                  <li>
                    <strong>Set your travel intent</strong>
                    <span>Risk profile, strategy pack, and personal interests.</span>
                  </li>
                  <li>
                    <strong>Get a live recommendation</strong>
                    <span>
                      Feasibility score, timeline, map candidate, and flight-triggered replan
                      signals.
                    </span>
                  </li>
                </ol>
              </div>

              <div className="empty-signals">
                <span className="empty-pill">Risk-aware scoring</span>
                <span className="empty-pill">Timeline + map</span>
                <span className="empty-pill">Auto-replan support</span>
              </div>
            </div>
          </article>
        </motion.section>
      ) : (
        <motion.section
          key="results"
          id="results-top"
          className="results"
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

            <p className="summary-updated mono">PLAN_SYNC: {generatedAtLabel}</p>
            <p className="summary-meta-line">
              Applied stop: {summaryCandidate?.name || "In-airport"} · {selectedByLabel} · Engine: {engineLatency}
            </p>
            <div className="decision-why">
              <p>Confidence score: {summaryScore}/100</p>
              <p>Slack: {formatMinutes(summarySlack)}</p>
            </div>
            <p className="narrative">{summaryNarrative}</p>
            {isPendingSelection && (
              <p className="pending-panel-note">
                Decision, timeline, and map will refresh together once the new choice is applied.
              </p>
            )}

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

            {sortedCandidates.length > 0 && (
              <section className="candidate-section">
                <p className="mini-label">Compare Alternative Stops</p>
                <p className="candidate-rank-note">
                  Ranked safest-first for current timing. Click a card to apply instantly.
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
                          key={candidate.name}
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
                      highlightCandidateName={mapFocusName}
                      compact
                      invalidateTrigger={`${activeTab}:${mapFocusName || "none"}:${isPendingSelection ? "pending" : "ready"}`}
                    />
                  </div>
                </div>
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
                  <span className="eyebrow">Itinerary Summary</span>
                  <h2>{planTitle}</h2>
                </div>
                <div className="decision-pill">
                  <span className="mini-label">System Recommendation</span>
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
              className={`tab-btn ${activeTab === "decision" ? "active" : ""}`}
              onClick={() => setActiveTab("decision")}
            >
              Decision
            </button>
            <button
              className={`tab-btn ${activeTab === "timeline" ? "active" : ""}`}
              onClick={() => setActiveTab("timeline")}
            >
              Timeline ({currentPlan.schedule?.length || 0})
            </button>
            <button
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
                  key="decision"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="card reveal tab-panel active"
                >
                  <div className="summary-head">
                    <h2>Trip snapshot</h2>
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
                  </div>
                </motion.article>
              )}

              {activeTab === "timeline" && (
                <motion.article
                  key="timeline"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="card reveal tab-panel active"
                >
                  <h2>Timeline</h2>
                  {isPendingSelection && (
                    <p className="pending-panel-note">
                      Refreshing timeline for {pendingCandidateName}. Showing current applied plan until update completes.
                    </p>
                  )}
                  <div className="timeline">
                    {currentPlan.schedule.map((item, idx) => (
                      <div key={`${item.label}-${idx}`} className="timeline-item">
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
                  key="map"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="card reveal tab-panel active"
                >
                  <h2>Map view</h2>
                  {isPendingSelection && (
                    <p className="pending-panel-note">
                      Refreshing map for {pendingCandidateName}. Route will update when the applied result returns.
                    </p>
                  )}
                  <Map
                    currentPlan={currentPlan}
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
