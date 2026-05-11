const { INTEREST_CONFIG } = require("../config/airports");
const { calculateFeasibility } = require("./feasibilityService");
const { generateAiSchedule } = require("./aiScheduleService");
const { fetchPois, getRouteEstimateMinutes } = require("./mapsService");
const { addMinutes, formatTimestamp, minutesBetween } = require("../utils/time");

const RISK_PROFILE_CONFIG = {
  conservative: {
    label: "Conservative",
    processingDelta: 10,
    returnBufferDelta: 20,
    maxTravelDelta: -6,
    dwellDelta: -10,
  },
  balanced: {
    label: "Balanced",
    processingDelta: 0,
    returnBufferDelta: 0,
    maxTravelDelta: 0,
    dwellDelta: 0,
  },
  explorer: {
    label: "Explorer",
    processingDelta: -5,
    returnBufferDelta: -15,
    maxTravelDelta: 6,
    dwellDelta: 15,
  },
};

const STRATEGY_PACK_CONFIG = {
  standard: {
    label: "Standard",
    fallbackInterests: ["sightseeing", "food"],
    dwellDelta: 0,
    maxTravelDelta: 0,
  },
  "food-first": {
    label: "Food First",
    fallbackInterests: ["food", "shopping"],
    dwellDelta: 10,
    maxTravelDelta: 0,
  },
  "culture-deep": {
    label: "Culture Deep Dive",
    fallbackInterests: ["culture", "sightseeing"],
    dwellDelta: 15,
    maxTravelDelta: -2,
  },
  recharge: {
    label: "Recharge Nearby",
    fallbackInterests: ["food"],
    dwellDelta: -10,
    maxTravelDelta: -6,
  },
  "local-gems": {
    label: "Local Gems",
    fallbackInterests: ["food", "culture", "shopping"],
    dwellDelta: 8,
    maxTravelDelta: 2,
  },
  "scenic-balance": {
    label: "Scenic Balance",
    fallbackInterests: ["sightseeing", "culture"],
    dwellDelta: 5,
    maxTravelDelta: 1,
  },
};

const RISK_RANK = {
  low: 0,
  medium: 1,
  high: 2,
};

function summarizeInterests(interests) {
  if (!interests.length) {
    return "general exploration";
  }
  return interests.map((interest) => INTEREST_CONFIG[interest]?.label || interest).join(", ");
}

function normalizeRiskProfile(profile) {
  return RISK_PROFILE_CONFIG[profile] ? profile : "balanced";
}

function normalizeStrategyPack(pack) {
  return STRATEGY_PACK_CONFIG[pack] ? pack : "standard";
}

function clampMinimum(value, minimum) {
  return Math.max(minimum, Math.round(value));
}

function normalizePoiName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCategory(value) {
  return String(value || "poi").trim().toLowerCase();
}

function normalizeRisk(value) {
  const risk = String(value || "").trim().toLowerCase();
  if (risk === "low" || risk === "medium" || risk === "high") {
    return risk;
  }
  return "high";
}

function riskRank(value) {
  return RISK_RANK[normalizeRisk(value)] ?? RISK_RANK.high;
}

function compareOptions(a, b) {
  const aFeasible = a?.feasibility?.feasible === true;
  const bFeasible = b?.feasibility?.feasible === true;
  if (aFeasible !== bFeasible) {
    return aFeasible ? -1 : 1;
  }

  const aRisk = riskRank(a?.feasibility?.riskLabel);
  const bRisk = riskRank(b?.feasibility?.riskLabel);
  if (aRisk !== bRisk) {
    return aRisk - bRisk;
  }

  if ((b?.feasibility?.score || 0) !== (a?.feasibility?.score || 0)) {
    return (b?.feasibility?.score || 0) - (a?.feasibility?.score || 0);
  }

  if ((b?.feasibility?.slackMinutes || 0) !== (a?.feasibility?.slackMinutes || 0)) {
    return (b?.feasibility?.slackMinutes || 0) - (a?.feasibility?.slackMinutes || 0);
  }

  return (b?.dwellMinutes || 0) - (a?.dwellMinutes || 0);
}

function buildCandidateSet(options, selectedOption, limit = 8) {
  if (!Array.isArray(options) || options.length === 0) {
    return [];
  }

  const sorted = [...options].sort(compareOptions);
  const selectedKey = selectedOption
    ? `${normalizePoiName(selectedOption.poi?.name)}:${normalizeCoordinate(
        selectedOption.poi?.lat
      )}:${normalizeCoordinate(selectedOption.poi?.lon)}`
    : null;
  const pickedKeys = new Set();
  const picked = [];

  const pushOption = (item) => {
    if (!item?.poi) {
      return;
    }
    const key = `${normalizePoiName(item.poi.name)}:${normalizeCoordinate(item.poi.lat)}:${normalizeCoordinate(item.poi.lon)}`;
    if (pickedKeys.has(key)) {
      return;
    }
    pickedKeys.add(key);
    picked.push(item);
  };

  if (selectedOption) {
    pushOption(selectedOption);
  }

  const categoryBuckets = new Map();
  for (const item of sorted) {
    const category = normalizeCategory(item.poi?.category);
    if (!categoryBuckets.has(category)) {
      categoryBuckets.set(category, []);
    }
    categoryBuckets.get(category).push(item);
  }

  for (const bucket of categoryBuckets.values()) {
    if (picked.length >= limit) {
      break;
    }
    pushOption(bucket[0]);
  }

  for (const item of sorted) {
    if (picked.length >= limit) {
      break;
    }
    pushOption(item);
  }

  // Keep ordering stable and safer-first.
  const dedupedSorted = picked.sort(compareOptions);
  if (selectedKey) {
    dedupedSorted.sort((left, right) => {
      const leftKey = `${normalizePoiName(left.poi?.name)}:${normalizeCoordinate(
        left.poi?.lat
      )}:${normalizeCoordinate(left.poi?.lon)}`;
      const rightKey = `${normalizePoiName(right.poi?.name)}:${normalizeCoordinate(
        right.poi?.lat
      )}:${normalizeCoordinate(right.poi?.lon)}`;
      if (leftKey === selectedKey) {
        return -1;
      }
      if (rightKey === selectedKey) {
        return 1;
      }
      return compareOptions(left, right);
    });
  }

  return dedupedSorted.slice(0, limit);
}

function poiMatchesRequested(poi, requestedPoi) {
  if (!poi || !requestedPoi) {
    return false;
  }

  const sameName =
    normalizePoiName(poi.name) &&
    normalizePoiName(poi.name) === normalizePoiName(requestedPoi.name);
  if (sameName) {
    return true;
  }

  const poiLat = normalizeCoordinate(poi.lat);
  const poiLon = normalizeCoordinate(poi.lon);
  if (poiLat == null || poiLon == null) {
    return false;
  }
  return (
    Math.abs(poiLat - requestedPoi.lat) <= 0.001 &&
    Math.abs(poiLon - requestedPoi.lon) <= 0.001
  );
}

function calculateScoreComponents({
  slackMinutes,
  outboundMinutes,
  inboundMinutes,
  dwellMinutes,
  maxTravelMinutesOneWay,
  recommendedTripMinutes = 45,
  feasibilityScoreBreakdown = null,
}) {
  const oneWay = Math.max(outboundMinutes || 0, inboundMinutes || 0);
  const imbalanceMinutes = Math.abs((outboundMinutes || 0) - (inboundMinutes || 0));
  const slackPoints =
    feasibilityScoreBreakdown?.slackComponent ??
    (slackMinutes >= 45 ? 55 : slackMinutes >= 20 ? 40 : slackMinutes >= 0 ? 20 : 0);
  const travelPoints =
    feasibilityScoreBreakdown?.travelComponent ??
    (oneWay <= maxTravelMinutesOneWay ? 25 : oneWay <= maxTravelMinutesOneWay + 8 ? 10 : 0);
  const dwellPoints =
    feasibilityScoreBreakdown?.dwellComponent ??
    (dwellMinutes >= recommendedTripMinutes ? 14 : dwellMinutes >= 30 ? 8 : 3);
  const variabilityPenalty = feasibilityScoreBreakdown?.variabilityPenalty ?? Math.max(0, imbalanceMinutes - 6);
  const totalPoints = Math.max(0, Math.round(slackPoints + travelPoints + dwellPoints - variabilityPenalty));

  return {
    slack: {
      points: slackPoints,
      maxPoints: 60,
      valueMinutes: slackMinutes,
    },
    travel: {
      points: travelPoints,
      maxPoints: 26,
      valueMinutes: oneWay,
      thresholdMinutes: maxTravelMinutesOneWay,
    },
    activity: {
      points: dwellPoints,
      maxPoints: 14,
      valueMinutes: dwellMinutes,
      thresholdMinutes: recommendedTripMinutes,
    },
    variability: {
      points: -variabilityPenalty,
      maxPenalty: 8,
      valueMinutes: imbalanceMinutes,
    },
    totalPoints,
  };
}

function buildNarrative({
  airport,
  selectedOption,
  connectionType,
  feasibility,
  interests,
  preferredPoiName,
}) {
  if (!selectedOption) {
    return `This ${connectionType} layover at ${airport.code} is too tight for a safe off-airport trip after applying processing time and return buffer rules. Staying inside the airport is the lower-risk option.`;
  }

  const selectedPoiName = selectedOption.poi.name;
  if (!feasibility.feasible) {
    return `You selected ${selectedPoiName} for this ${connectionType} connection at ${airport.code}, but the current window rates this stop as high risk. The plan still leaves after a ${selectedOption.processingMinutes}-minute processing window and returns with a ${selectedOption.returnBufferMinutes}-minute safety buffer, but staying in-airport is safer unless your timing improves.`;
  }

  const selectedPrefix = preferredPoiName
    ? `You selected ${selectedPoiName} for this ${connectionType} connection at ${airport.code}.`
    : `For this ${connectionType} connection at ${airport.code}, ${selectedPoiName} is the top-ranked off-airport option.`;

  return `${selectedPrefix} The plan leaves the airport after a ${selectedOption.processingMinutes}-minute processing window, spends about ${selectedOption.dwellMinutes} minutes focused on ${summarizeInterests(interests)}, and returns with a ${selectedOption.returnBufferMinutes}-minute safety buffer. The itinerary is rated ${feasibility.riskLabel.toLowerCase()} risk with a feasibility score of ${feasibility.score}/100.`;
}

function buildSchedule({ airport, departureTime, option }) {
  const leaveAirportAt = addMinutes(option.planStartTime, option.processingMinutes);
  const arrivePoiAt = addMinutes(leaveAirportAt, option.outboundMinutes);
  const leavePoiAt = addMinutes(arrivePoiAt, option.dwellMinutes);
  const backAtAirportAt = addMinutes(leavePoiAt, option.inboundMinutes);
  const recommendedTerminalReturnAt = addMinutes(backAtAirportAt, option.returnBufferMinutes);

  return [
    {
      label: "Arrive and clear airport processing",
      start: formatTimestamp(option.planStartTime),
      end: formatTimestamp(leaveAirportAt),
      minutes: option.processingMinutes,
      location: airport.name,
    },
    {
      label: `Travel to ${option.poi.name}`,
      start: formatTimestamp(leaveAirportAt),
      end: formatTimestamp(arrivePoiAt),
      minutes: option.outboundMinutes,
      location: option.poi.name,
    },
    {
      label: `Explore ${option.poi.name}`,
      start: formatTimestamp(arrivePoiAt),
      end: formatTimestamp(leavePoiAt),
      minutes: option.dwellMinutes,
      location: option.poi.name,
    },
    {
      label: `Return to ${airport.code}`,
      start: formatTimestamp(leavePoiAt),
      end: formatTimestamp(backAtAirportAt),
      minutes: option.inboundMinutes,
      location: airport.name,
    },
    {
      label: "Recommended airport buffer before departure",
      start: formatTimestamp(backAtAirportAt),
      end: formatTimestamp(recommendedTerminalReturnAt),
      minutes: option.returnBufferMinutes,
      location: airport.name,
    },
    {
      label: "Ready for departing flight",
      start: formatTimestamp(recommendedTerminalReturnAt),
      end: formatTimestamp(departureTime),
      minutes: Math.max(0, minutesBetween(recommendedTerminalReturnAt, departureTime)),
      location: airport.name,
    },
  ];
}

async function buildLayoverPlan({
  airport,
  arrivalTime,
  departureTime,
  connectionType,
  interests,
  riskProfile = "balanced",
  strategyPack = "standard",
  airlineCode = null,
  flightNumber = null,
  preferredPoiName = null,
  preferredPoi = null,
}) {
  const planStartTime = arrivalTime instanceof Date ? arrivalTime : new Date();
  const layoverMinutes = minutesBetween(planStartTime, departureTime);
  const normalizedRiskProfile = normalizeRiskProfile(riskProfile);
  const normalizedStrategyPack = normalizeStrategyPack(strategyPack);
  const riskConfig = RISK_PROFILE_CONFIG[normalizedRiskProfile];
  const strategyConfig = STRATEGY_PACK_CONFIG[normalizedStrategyPack];
  const baseProcessingMinutes = airport.processingMinutes[connectionType];
  const baseReturnBufferMinutes = airport.returnBufferMinutes[connectionType];
  const baseRecommendedTripMinutes = airport.recommendedTripMinutes[connectionType];
  const baseMaxTravelMinutesOneWay = airport.maxTravelMinutesOneWay[connectionType];
  const processingMinutes = clampMinimum(baseProcessingMinutes + riskConfig.processingDelta, 10);
  const returnBufferMinutes = clampMinimum(baseReturnBufferMinutes + riskConfig.returnBufferDelta, 45);
  const recommendedTripMinutes = clampMinimum(
    baseRecommendedTripMinutes + riskConfig.dwellDelta + strategyConfig.dwellDelta,
    20
  );
  const maxTravelMinutesOneWay = clampMinimum(
    baseMaxTravelMinutesOneWay + riskConfig.maxTravelDelta + strategyConfig.maxTravelDelta,
    8
  );
  const tagSet = new Set();

  const effectiveInterests = interests.length
    ? interests
    : strategyConfig.fallbackInterests;
  effectiveInterests.forEach((interest) => {
    for (const tag of INTEREST_CONFIG[interest].tags) {
      tagSet.add(tag);
    }
  });

  const availableTripMinutes = layoverMinutes - processingMinutes - returnBufferMinutes;
  const requestedPreferredPoiName = preferredPoiName || preferredPoi?.name || null;
  const normalizedPreferredPoiName = normalizePoiName(requestedPreferredPoiName);
  const requestedPreferredPoi =
    preferredPoi &&
    typeof preferredPoi === "object" &&
    normalizeCoordinate(preferredPoi.lat) != null &&
    normalizeCoordinate(preferredPoi.lon) != null &&
    normalizePoiName(preferredPoi.name)
      ? {
          name: String(preferredPoi.name || "").trim(),
          lat: normalizeCoordinate(preferredPoi.lat),
          lon: normalizeCoordinate(preferredPoi.lon),
          category: preferredPoi.category || "poi",
          address: preferredPoi.address || "",
        }
      : null;

  let pois = [];
  if (availableTripMinutes > 30) {
    try {
      pois = await fetchPois({ airport, tags: [...tagSet] });
    } catch (_error) {
      // Graceful fallback: continue with in-airport recommendation when POI lookup fails.
      pois = [];
    }
  }

  const hasRequestedPreferredPoi = requestedPreferredPoi
    ? pois.some((poi) => poiMatchesRequested(poi, requestedPreferredPoi))
    : false;
  if (requestedPreferredPoi && !hasRequestedPreferredPoi) {
    pois = [requestedPreferredPoi, ...pois];
  }
  const prioritizedPois = requestedPreferredPoi
    ? [
        requestedPreferredPoi,
        ...pois.filter((poi) => !poiMatchesRequested(poi, requestedPreferredPoi)),
      ]
    : pois;

  const enriched = [];
  for (const poi of prioritizedPois.slice(0, 20)) {
    const outboundMinutes = await getRouteEstimateMinutes(
      { lat: airport.lat, lon: airport.lon },
      { lat: poi.lat, lon: poi.lon },
      airport.defaultTransportMode
    );
    const inboundMinutes = outboundMinutes;
    const dwellMinutes = Math.max(
      20,
      Math.min(
        recommendedTripMinutes,
        availableTripMinutes - outboundMinutes - inboundMinutes
      )
    );

    const feasibility = calculateFeasibility({
      layoverMinutes,
      outboundMinutes,
      dwellMinutes,
      inboundMinutes,
      processingMinutes,
      returnBufferMinutes,
      maxTravelMinutesOneWay,
      recommendedDwellMinutes: recommendedTripMinutes,
    });

    enriched.push({
      poi,
      processingMinutes,
      outboundMinutes,
      inboundMinutes,
      dwellMinutes,
      returnBufferMinutes,
      planStartTime,
      feasibility,
    });
  }

  enriched.sort(compareOptions);

  let preferredOption = requestedPreferredPoi
    ? enriched.find((item) => poiMatchesRequested(item.poi, requestedPreferredPoi)) || null
    : null;
  if (!preferredOption && normalizedPreferredPoiName) {
    preferredOption =
      enriched.find((item) => normalizePoiName(item.poi.name) === normalizedPreferredPoiName) || null;
  }
  const bestFeasibleOption = enriched.find((item) => item.feasibility.feasible) || null;
  const selectedOption = preferredOption || bestFeasibleOption || enriched[0] || null;
  const feasibility = selectedOption
    ? selectedOption.feasibility
    : calculateFeasibility({
        layoverMinutes,
        outboundMinutes: 0,
        dwellMinutes: 0,
        inboundMinutes: 0,
        processingMinutes,
        returnBufferMinutes,
        maxTravelMinutesOneWay,
      });

  const baseSchedule = selectedOption
    ? buildSchedule({ airport, departureTime, option: selectedOption })
    : [];
  const fallbackNarrative = buildNarrative({
    airport,
    selectedOption,
    connectionType,
    feasibility,
    interests: effectiveInterests,
    preferredPoiName: preferredOption ? requestedPreferredPoiName : null,
  });
  const selectedPoi = selectedOption
    ? {
        name: selectedOption.poi.name,
        lat: selectedOption.poi.lat,
        lon: selectedOption.poi.lon,
        category: selectedOption.poi.category,
        address: selectedOption.poi.address,
        outboundMinutes: selectedOption.outboundMinutes,
        inboundMinutes: selectedOption.inboundMinutes,
        dwellMinutes: selectedOption.dwellMinutes,
        score: selectedOption.feasibility.score,
        riskLabel: selectedOption.feasibility.riskLabel,
        feasible: selectedOption.feasibility.feasible,
        slackMinutes: selectedOption.feasibility.slackMinutes,
      }
    : null;
  const summary = {
    layoverMinutes,
    baseProcessingMinutes,
    baseReturnBufferMinutes,
    baseRecommendedTripMinutes,
    baseMaxTravelMinutesOneWay,
    processingMinutes,
    returnBufferMinutes,
    recommendedTripMinutes,
    maxTravelMinutesOneWay,
    availableTripMinutes,
  };
  const scoreComponents = calculateScoreComponents({
    slackMinutes: feasibility.slackMinutes,
    outboundMinutes: selectedOption?.outboundMinutes || 0,
    inboundMinutes: selectedOption?.inboundMinutes || 0,
    dwellMinutes: selectedOption?.dwellMinutes || 0,
    maxTravelMinutesOneWay,
    recommendedTripMinutes,
    feasibilityScoreBreakdown: feasibility?.scoreBreakdown || null,
  });
  const candidateSet = buildCandidateSet(enriched, selectedOption, 8);
  const aiPlan = await generateAiSchedule({
    airport,
    connectionType,
    interests: effectiveInterests,
    feasibility,
    summary,
    selectedPoi,
    schedule: baseSchedule,
    fallbackNarrative,
  });

  return {
    request: {
      airportCode: airport.code,
      connectionType,
      interests: effectiveInterests,
      arrivalTime: planStartTime.toISOString(),
      departureTime: departureTime.toISOString(),
      riskProfile: normalizedRiskProfile,
      strategyPack: normalizedStrategyPack,
      airlineCode,
      flightNumber,
      preferredPoiName: preferredOption ? preferredOption.poi.name : null,
    },
    airport,
    feasibility,
    summary,
    schedule: aiPlan.schedule,
    narrative: aiPlan.narrative,
    ai: {
      provider: aiPlan.provider,
      model: aiPlan.model,
      used: aiPlan.used,
      title: aiPlan.title,
      travelerTips: aiPlan.travelerTips,
      error: aiPlan.error,
    },
    explainability: {
      riskProfile: {
        key: normalizedRiskProfile,
        label: riskConfig.label,
        adjustments: {
          processingDelta: riskConfig.processingDelta,
          returnBufferDelta: riskConfig.returnBufferDelta,
          maxTravelDelta: riskConfig.maxTravelDelta,
          dwellDelta: riskConfig.dwellDelta,
        },
      },
      strategyPack: {
        key: normalizedStrategyPack,
        label: strategyConfig.label,
        fallbackInterests: strategyConfig.fallbackInterests,
        adjustments: {
          dwellDelta: strategyConfig.dwellDelta,
          maxTravelDelta: strategyConfig.maxTravelDelta,
        },
      },
      scoreComponents,
    },
    selection: {
      requestedPoiName: requestedPreferredPoiName,
      selectedBy: preferredOption
        ? "user-preference"
        : selectedOption
          ? "system-ranking"
          : "none",
      preferredMatchFound: Boolean(preferredOption),
    },
    map: {
      airport: {
        code: airport.code,
        name: airport.name,
        lat: airport.lat,
        lon: airport.lon,
      },
      selectedPoi,
      candidates: candidateSet.map((item) => ({
        name: item.poi.name,
        lat: item.poi.lat,
        lon: item.poi.lon,
        category: item.poi.category,
        address: item.poi.address || "",
        score: item.feasibility.score,
        riskLabel: item.feasibility.riskLabel,
        feasible: item.feasibility.feasible,
        slackMinutes: item.feasibility.slackMinutes,
        outboundMinutes: item.outboundMinutes,
        inboundMinutes: item.inboundMinutes,
        dwellMinutes: item.dwellMinutes,
        selected: Boolean(
          selectedPoi && normalizePoiName(selectedPoi.name) === normalizePoiName(item.poi.name)
        ),
      })),
    },
  };
}

module.exports = {
  buildLayoverPlan,
};
