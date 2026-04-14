function calculateFeasibility({
  layoverMinutes,
  outboundMinutes,
  dwellMinutes,
  inboundMinutes,
  processingMinutes,
  returnBufferMinutes,
  maxTravelMinutesOneWay,
}) {
  const totalRequiredMinutes =
    processingMinutes + outboundMinutes + dwellMinutes + inboundMinutes + returnBufferMinutes;

  const slackMinutes = layoverMinutes - totalRequiredMinutes;

  let score = 0;

  if (slackMinutes >= 45) {
    score += 55;
  } else if (slackMinutes >= 20) {
    score += 40;
  } else if (slackMinutes >= 0) {
    score += 20;
  }

  if (Math.max(outboundMinutes, inboundMinutes) <= maxTravelMinutesOneWay) {
    score += 25;
  } else if (Math.max(outboundMinutes, inboundMinutes) <= maxTravelMinutesOneWay + 8) {
    score += 10;
  }

  if (dwellMinutes >= 45) {
    score += 20;
  } else if (dwellMinutes >= 30) {
    score += 10;
  }

  const normalizedScore = Math.max(0, Math.min(100, score));

  let riskLabel = "High";
  if (slackMinutes >= 30 && normalizedScore >= 70) {
    riskLabel = "Low";
  } else if (slackMinutes >= 0 && normalizedScore >= 40) {
    riskLabel = "Medium";
  }

  return {
    feasible: slackMinutes >= 0,
    layoverMinutes,
    totalRequiredMinutes,
    slackMinutes,
    score: normalizedScore,
    riskLabel,
  };
}

module.exports = {
  calculateFeasibility,
};
