const AIRLINE_NAMES = {
  AA: "American Airlines",
  DL: "Delta Air Lines",
  UA: "United Airlines",
  WN: "Southwest Airlines",
  AS: "Alaska Airlines",
  B6: "JetBlue",
};

const flightState = new Map();

function normalizeFlightCode(value, maxLength) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickFromSeed(seed, values) {
  return values[seed % values.length];
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function getStateKey({ airlineCode, flightNumber, airportCode, departureTime }) {
  return [
    airlineCode || "XX",
    flightNumber || "0000",
    airportCode || "UNK",
    toIso(departureTime) || "none",
  ].join("-");
}

function initFlightState({ key, seed }) {
  const terminal = String.fromCharCode(65 + (seed % 4));
  const gateNumber = 5 + (seed % 55);
  const delayMinutes = pickFromSeed(seed, [0, 0, 5, 10, 15, 20, 30]);
  const gateChangeEligible = seed % 5 === 0;

  return {
    key,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    terminal,
    gate: `${terminal}${gateNumber}`,
    delayMinutes,
    gateChanged: false,
    gateChangeEligible,
    lastKnownStatus: "scheduled",
  };
}

function maybeMutateFlightState(state, now, seed) {
  const ageMs = now - state.createdAt;
  if (state.gateChangeEligible && !state.gateChanged && ageMs > 120000) {
    const nextGate = 10 + (seed % 60);
    state.gate = `${state.terminal}${nextGate}`;
    state.gateChanged = true;
  }

  if (ageMs > 300000 && state.delayMinutes > 0) {
    state.delayMinutes = Math.max(0, state.delayMinutes - 5);
  }

  state.updatedAt = now;
}

function deriveStatus({ departureTime, delayMinutes }) {
  const now = Date.now();
  const departureDate = new Date(departureTime);
  const delayedDeparture = departureDate.getTime() + delayMinutes * 60000;
  const minutesToDeparture = Math.round((delayedDeparture - now) / 60000);

  if (minutesToDeparture <= -20) {
    return {
      code: "departed",
      label: "Departed",
      minutesToDeparture,
      boardingSoon: false,
    };
  }
  if (minutesToDeparture <= 15) {
    return {
      code: "boarding",
      label: "Boarding",
      minutesToDeparture,
      boardingSoon: true,
    };
  }
  if (minutesToDeparture <= 60) {
    return {
      code: "final-call",
      label: "Final call window",
      minutesToDeparture,
      boardingSoon: true,
    };
  }
  if (delayMinutes >= 15) {
    return {
      code: "delayed",
      label: "Delayed",
      minutesToDeparture,
      boardingSoon: false,
    };
  }
  return {
    code: "on-time",
    label: "On time",
    minutesToDeparture,
    boardingSoon: false,
  };
}

function deriveEvents({ state, status, departureTime }) {
  const events = [];

  if (state.delayMinutes > 0) {
    events.push({
      type: "delay",
      severity: state.delayMinutes >= 20 ? "high" : "medium",
      message: `Flight delay currently estimated at ${state.delayMinutes} minutes.`,
    });
  }

  if (state.gateChanged) {
    events.push({
      type: "gate_change",
      severity: "medium",
      message: `Gate changed to ${state.gate}.`,
    });
  }

  if (status.boardingSoon) {
    events.push({
      type: "boarding_soon",
      severity: "high",
      message: "Boarding window is close; avoid long off-airport routes.",
    });
  }

  let suggestedDepartureTime = toIso(departureTime);
  let trigger = "none";
  let recommended = false;
  let reason = "Current conditions do not require automatic replanning.";

  if (state.delayMinutes >= 15) {
    const date = new Date(departureTime);
    date.setMinutes(date.getMinutes() + state.delayMinutes);
    suggestedDepartureTime = date.toISOString();
    trigger = "delay";
    recommended = true;
    reason = "Delay detected. Replanning can unlock safer additional layover time.";
  }

  if (status.boardingSoon) {
    trigger = "boarding_soon";
    recommended = true;
    reason = "Boarding is close. Replanning should prioritize immediate airport return.";
  }

  if (state.gateChanged && !status.boardingSoon) {
    trigger = "gate_change";
    recommended = true;
    reason = "Gate changed. Replanning helps re-evaluate transfer slack.";
  }

  return {
    events,
    replan: {
      trigger,
      recommended,
      reason,
      suggestedDepartureTime,
    },
  };
}

function getFlightStatus({
  airlineCode,
  flightNumber,
  airportCode,
  arrivalTime,
  departureTime,
}) {
  const normalizedAirlineCode = normalizeFlightCode(airlineCode, 3);
  const normalizedFlightNumber = normalizeFlightCode(flightNumber, 6);

  if (!normalizedAirlineCode || !normalizedFlightNumber) {
    return {
      provider: "simulated",
      usedTicketContext: false,
      airlineCode: normalizedAirlineCode || null,
      flightNumber: normalizedFlightNumber || null,
      airlineName: null,
      statusCode: "unknown",
      statusLabel: "No flight context",
      terminal: null,
      gate: null,
      delayMinutes: 0,
      boardingSoon: false,
      minutesToDeparture: null,
      scheduledArrival: toIso(arrivalTime),
      scheduledDeparture: toIso(departureTime),
      updatedAt: new Date().toISOString(),
      events: [],
      replan: {
        trigger: "none",
        recommended: false,
        reason: "Add airline code and flight number to enable flight-linked replanning.",
        suggestedDepartureTime: toIso(departureTime),
      },
    };
  }

  const key = getStateKey({
    airlineCode: normalizedAirlineCode,
    flightNumber: normalizedFlightNumber,
    airportCode,
    departureTime,
  });
  const seed = hashString(key);
  const now = Date.now();
  const state = flightState.get(key) || initFlightState({ key, seed });
  maybeMutateFlightState(state, now, seed);
  const status = deriveStatus({
    departureTime,
    delayMinutes: state.delayMinutes,
  });
  state.lastKnownStatus = status.code;
  flightState.set(key, state);

  const { events, replan } = deriveEvents({
    state,
    status,
    departureTime,
  });

  return {
    provider: "simulated",
    usedTicketContext: true,
    airlineCode: normalizedAirlineCode,
    flightNumber: normalizedFlightNumber,
    airlineName: AIRLINE_NAMES[normalizedAirlineCode] || null,
    statusCode: status.code,
    statusLabel: status.label,
    terminal: state.terminal,
    gate: state.gate,
    delayMinutes: state.delayMinutes,
    boardingSoon: status.boardingSoon,
    minutesToDeparture: status.minutesToDeparture,
    scheduledArrival: toIso(arrivalTime),
    scheduledDeparture: toIso(departureTime),
    updatedAt: new Date(now).toISOString(),
    events,
    replan,
  };
}

module.exports = {
  normalizeFlightCode,
  getFlightStatus,
};

