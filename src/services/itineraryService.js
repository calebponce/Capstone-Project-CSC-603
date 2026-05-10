const { INTEREST_CONFIG } = require("../config/airports");
const { calculateFeasibility } = require("./feasibilityService");
const { generateAiSchedule } = require("./aiScheduleService");
const { fetchPois, getRouteEstimateMinutes } = require("./mapsService");
const { addMinutes, formatTimestamp, minutesBetween } = require("../utils/time");

function summarizeInterests(interests) {
  if (!interests.length) {
    return "general exploration";
  }
  return interests.map((interest) => INTEREST_CONFIG[interest]?.label || interest).join(", ");
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

async function buildLayoverPlan({ airport, arrivalTime, departureTime, connectionType, interests }) {
  const planStartTime = arrivalTime instanceof Date ? arrivalTime : new Date();
  const layoverMinutes = minutesBetween(planStartTime, departureTime);

  const processingMinutes = airport.processingMinutes[connectionType];
  const returnBufferMinutes = airport.returnBufferMinutes[connectionType];
  const recommendedTripMinutes = airport.recommendedTripMinutes[connectionType];
  const maxTravelMinutesOneWay = airport.maxTravelMinutesOneWay[connectionType];
  const tagSet = new Set();

  const effectiveInterests = interests.length ? interests : ["sightseeing", "food"];
  effectiveInterests.forEach((interest) => {
    for (const tag of INTEREST_CONFIG[interest].tags) {
      tagSet.add(tag);
    }
  });

  const availableTripMinutes = layoverMinutes - processingMinutes - returnBufferMinutes;

  const pois = availableTripMinutes > 30
    ? await fetchPois({ airport, tags: [...tagSet] })
    : [];

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
    processingMinutes,
    returnBufferMinutes,
    availableTripMinutes,
  };
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
