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

function calculateScoreComponents({
  slackMinutes,
  outboundMinutes,
  inboundMinutes,
  dwellMinutes,
  maxTravelMinutesOneWay,
}) {
  const oneWay = Math.max(outboundMinutes || 0, inboundMinutes || 0);
  const slackPoints = slackMinutes >= 45 ? 55 : slackMinutes >= 20 ? 40 : slackMinutes >= 0 ? 20 : 0;
  const travelPoints = oneWay <= maxTravelMinutesOneWay ? 25 : oneWay <= maxTravelMinutesOneWay + 8 ? 10 : 0;
  const dwellPoints = dwellMinutes >= 45 ? 20 : dwellMinutes >= 30 ? 10 : 0;

  return {
    slack: {
      points: slackPoints,
      maxPoints: 55,
      valueMinutes: slackMinutes,
    },
    travel: {
      points: travelPoints,
      maxPoints: 25,
      valueMinutes: oneWay,
      thresholdMinutes: maxTravelMinutesOneWay,
    },
    activity: {
      points: dwellPoints,
      maxPoints: 20,
      valueMinutes: dwellMinutes,
    },
    totalPoints: slackPoints + travelPoints + dwellPoints,
  };
}

function buildNarrative({ airport, bestOption, connectionType, feasibility, interests }) {
  if (!bestOption) {
    return `This ${connectionType} layover at ${airport.code} is too tight for a safe off-airport trip after applying processing time and return buffer rules. Staying inside the airport is the lower-risk option.`;
  }

  return `For this ${connectionType} connection at ${airport.code}, the safest off-airport option is ${bestOption.poi.name}. The plan leaves the airport after a ${bestOption.processingMinutes}-minute processing window, spends about ${bestOption.dwellMinutes} minutes focused on ${summarizeInterests(interests)}, and returns with a ${bestOption.returnBufferMinutes}-minute safety buffer. The itinerary is rated ${feasibility.riskLabel.toLowerCase()} risk with a feasibility score of ${feasibility.score}/100.`;
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

  let pois = [];
  if (availableTripMinutes > 30) {
    try {
      pois = await fetchPois({ airport, tags: [...tagSet] });
    } catch (_error) {
      // Graceful fallback: continue with in-airport recommendation when POI lookup fails.
      pois = [];
    }
  }

  const enriched = [];
  for (const poi of pois.slice(0, 12)) {
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

  enriched.sort((a, b) => {
    if (b.feasibility.score !== a.feasibility.score) {
      return b.feasibility.score - a.feasibility.score;
    }
    return b.dwellMinutes - a.dwellMinutes;
  });

  const bestOption = enriched.find((item) => item.feasibility.feasible) || null;
  const feasibility = bestOption
    ? bestOption.feasibility
    : calculateFeasibility({
        layoverMinutes,
        outboundMinutes: 0,
        dwellMinutes: 0,
        inboundMinutes: 0,
        processingMinutes,
        returnBufferMinutes,
        maxTravelMinutesOneWay,
      });

  const baseSchedule = bestOption ? buildSchedule({ airport, departureTime, option: bestOption }) : [];
  const fallbackNarrative = buildNarrative({
    airport,
    bestOption,
    connectionType,
    feasibility,
    interests: effectiveInterests,
  });
  const selectedPoi = bestOption
    ? {
        name: bestOption.poi.name,
        lat: bestOption.poi.lat,
        lon: bestOption.poi.lon,
        category: bestOption.poi.category,
        address: bestOption.poi.address,
        outboundMinutes: bestOption.outboundMinutes,
        inboundMinutes: bestOption.inboundMinutes,
        dwellMinutes: bestOption.dwellMinutes,
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
    outboundMinutes: bestOption?.outboundMinutes || 0,
    inboundMinutes: bestOption?.inboundMinutes || 0,
    dwellMinutes: bestOption?.dwellMinutes || 0,
    maxTravelMinutesOneWay,
  });
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
    map: {
      airport: {
        name: airport.name,
        lat: airport.lat,
        lon: airport.lon,
      },
      selectedPoi,
      candidates: enriched.slice(0, 5).map((item) => ({
        name: item.poi.name,
        lat: item.poi.lat,
        lon: item.poi.lon,
        category: item.poi.category,
        score: item.feasibility.score,
        riskLabel: item.feasibility.riskLabel,
      })),
    },
  };
}

module.exports = {
  buildLayoverPlan,
};
