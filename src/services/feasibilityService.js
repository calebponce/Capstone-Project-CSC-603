function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function slackPoints(slackMinutes) {
  if (slackMinutes >= 60) {
    return 60;
  }
  if (slackMinutes >= 0) {
    // Smooth ramp: 0min => 28, 60min => 60
    return Math.round(28 + (slackMinutes / 60) * 32);
  }
  if (slackMinutes >= -30) {
    // Keep a soft gradient for slightly infeasible routes.
    return Math.round(Math.max(0, 28 + (slackMinutes / 30) * 28));
  }
  return 0;
}

function travelPoints(oneWayMinutes, maxTravelMinutesOneWay) {
  const safeThreshold = Math.max(1, toNumber(maxTravelMinutesOneWay, 1));
  const ratio = oneWayMinutes / safeThreshold;

  if (ratio <= 1) {
    // Within threshold stays near full score, with slight preference for shorter routes.
    return Math.round(26 - ratio * 4);
  }
  if (ratio <= 1.35) {
    // Degrade quickly after threshold.
    return Math.round(22 - ((ratio - 1) / 0.35) * 16);
  }
  if (ratio <= 1.8) {
    return Math.round(6 - ((ratio - 1.35) / 0.45) * 6);
  }
  return 0;
}

function dwellPoints(dwellMinutes, recommendedDwellMinutes) {
  const recommended = Math.max(20, toNumber(recommendedDwellMinutes, 45));
  const ratio = clamp(dwellMinutes / recommended, 0, 1.35);

  if (ratio >= 1) {
    return 14;
  }
  if (ratio >= 0.75) {
    return Math.round(9 + ((ratio - 0.75) / 0.25) * 5);
  }
  if (ratio >= 0.5) {
    return Math.round(4 + ((ratio - 0.5) / 0.25) * 5);
  }
  return Math.round(ratio * 8);
}

function calculateFeasibility({
  layoverMinutes,
  outboundMinutes,
  dwellMinutes,
  inboundMinutes,
  processingMinutes,
  returnBufferMinutes,
  maxTravelMinutesOneWay,
  recommendedDwellMinutes = 45,
}) {
  const totalRequiredMinutes =
    processingMinutes + outboundMinutes + dwellMinutes + inboundMinutes + returnBufferMinutes;

  const slackMinutes = layoverMinutes - totalRequiredMinutes;

  const outbound = toNumber(outboundMinutes);
  const inbound = toNumber(inboundMinutes);
  const dwell = toNumber(dwellMinutes);
  const oneWayTravel = Math.max(outbound, inbound);
  const variabilityPenalty = Math.max(0, Math.abs(outbound - inbound) - 6);
  const slackComponent = slackPoints(slackMinutes);
  const travelComponent = travelPoints(oneWayTravel, maxTravelMinutesOneWay);
  const dwellComponent = dwellPoints(dwell, recommendedDwellMinutes);
  const penalty = Math.min(8, Math.round(variabilityPenalty * 0.6));

  const rawScore = slackComponent + travelComponent + dwellComponent - penalty;
  const normalizedScore = clamp(Math.round(rawScore), 0, 100);
  const feasible = slackMinutes >= 0;

  let riskLabel = "High";
  if (feasible && slackMinutes >= 35 && normalizedScore >= 72) {
    riskLabel = "Low";
  } else if (feasible && slackMinutes >= 10 && normalizedScore >= 52) {
    riskLabel = "Medium";
  }

  return {
    feasible,
    layoverMinutes,
    totalRequiredMinutes,
    slackMinutes,
    score: normalizedScore,
    riskLabel,
    scoreBreakdown: {
      slackComponent,
      travelComponent,
      dwellComponent,
      variabilityPenalty: penalty,
    },
  };
}

module.exports = {
  calculateFeasibility,
};
