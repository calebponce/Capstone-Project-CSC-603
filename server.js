const { loadEnvFile } = require("./src/config/env");
const express = require("express");
const path = require("path");
const pkg = require("./package.json");
const {
  AIRPORTS,
  INTEREST_CONFIG,
  getAirportConfig,
} = require("./src/config/airports");
const { buildLayoverPlan } = require("./src/services/itineraryService");
const { getFlightStatus } = require("./src/services/flightService");
const { getMapsRuntimeStats } = require("./src/services/mapsService");

loadEnvFile();

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";
const MAX_FEEDBACK_ITEMS = 240;
const MAX_EVENT_ITEMS = 500;
const MAX_REPLAN_HISTORY_ITEMS = 30;
const apiUsage = {
  allApiRequests: 0,
  health: 0,
  config: 0,
  usage: 0,
  plan: 0,
  flightStatus: 0,
  feedback: 0,
  events: 0,
  replanHistory: 0,
  planErrors: 0,
  planAutoReplans: 0,
  planTotalDurationMs: 0,
  planLastDurationMs: null,
  planLastStatus: "never",
  planLastAt: null,
  planLastError: null,
};
const feedbackStore = [];
const eventStore = [];
const replanHistoryStore = new Map();

function markApiRequest(routeKey) {
  apiUsage.allApiRequests += 1;
  if (Object.prototype.hasOwnProperty.call(apiUsage, routeKey)) {
    apiUsage[routeKey] += 1;
  }
}

function normalizeTicketField(value, { maxLength }) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength);
}

function normalizeRiskProfile(value) {
  return ["conservative", "balanced", "explorer"].includes(value) ? value : "balanced";
}

function normalizeStrategyPack(value) {
  return ["standard", "food-first", "culture-deep", "recharge"].includes(value)
    ? value
    : "standard";
}

function toIsoSafe(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function buildSessionKey({
  airportCode,
  arrivalTime,
  departureTime,
  airlineCode,
  flightNumber,
  connectionType,
}) {
  const keyParts = [
    airportCode || "UNK",
    connectionType || "domestic",
    toIsoSafe(arrivalTime) || "arrival-none",
    toIsoSafe(departureTime) || "departure-none",
    airlineCode || "XX",
    flightNumber || "0000",
  ];
  return keyParts.join("|");
}

function trimStore(store, maxItems) {
  while (store.length > maxItems) {
    store.shift();
  }
}

function sanitizeFreeText(value, maxLength = 320) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function appendReplanHistory(sessionKey, entry) {
  if (!sessionKey) {
    return [];
  }
  const current = replanHistoryStore.get(sessionKey) || [];
  current.push(entry);
  while (current.length > MAX_REPLAN_HISTORY_ITEMS) {
    current.shift();
  }
  replanHistoryStore.set(sessionKey, current);
  return current;
}

function getReplanHistory(sessionKey, limit = 10) {
  if (!sessionKey) {
    return [];
  }
  const items = replanHistoryStore.get(sessionKey) || [];
  return items.slice(Math.max(0, items.length - limit)).reverse();
}

function sendError(res, statusCode, message, details) {
  return res.status(statusCode).json({
    error: message,
    ...(details ? { details } : {}),
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  markApiRequest("health");
  res.json({
    status: "ok",
    name: pkg.name,
    version: pkg.version,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get("/api/config", (_req, res) => {
  markApiRequest("config");
  res.json({
    meta: {
      generatedAt: new Date().toISOString(),
      apiVersion: pkg.version,
    },
    airports: AIRPORTS,
    interests: INTEREST_CONFIG,
  });
});

app.get("/api/usage", (_req, res) => {
  markApiRequest("usage");
  const successfulPlans = Math.max(0, apiUsage.plan - apiUsage.planErrors);
  const planAverageDurationMs =
    successfulPlans > 0
      ? Math.round(apiUsage.planTotalDurationMs / successfulPlans)
      : null;
  const mapsRuntime = getMapsRuntimeStats();

  return res.json({
    meta: {
      generatedAt: new Date().toISOString(),
      apiVersion: pkg.version,
      uptimeSeconds: Math.round(process.uptime()),
    },
    totals: {
      allApiRequests: apiUsage.allApiRequests,
      healthChecks: apiUsage.health,
      configLoads: apiUsage.config,
      usageViews: apiUsage.usage,
      planRequests: apiUsage.plan,
      flightStatusChecks: apiUsage.flightStatus,
      feedbackSubmissions: apiUsage.feedback,
      analyticsEvents: apiUsage.events,
      replanHistoryViews: apiUsage.replanHistory,
      autoReplanTriggers: apiUsage.planAutoReplans,
      planErrors: apiUsage.planErrors,
    },
    planLatency: {
      averageMs: planAverageDurationMs,
      lastMs: apiUsage.planLastDurationMs,
    },
    lastPlan: {
      status: apiUsage.planLastStatus,
      at: apiUsage.planLastAt,
      error: apiUsage.planLastError,
    },
    mapsRuntime,
    feedbackSampleSize: feedbackStore.length,
    eventSampleSize: eventStore.length,
  });
});

app.post("/api/event", (req, res) => {
  markApiRequest("events");
  const eventType = sanitizeFreeText(req.body?.eventType, 64);
  if (!eventType) {
    return sendError(res, 400, "eventType is required.");
  }

  const item = {
    eventType,
    stage: sanitizeFreeText(req.body?.stage, 64) || null,
    sessionKey: sanitizeFreeText(req.body?.sessionKey, 180) || null,
    details: req.body?.details && typeof req.body.details === "object" ? req.body.details : {},
    at: new Date().toISOString(),
  };
  eventStore.push(item);
  trimStore(eventStore, MAX_EVENT_ITEMS);

  return res.json({
    ok: true,
    recordedAt: item.at,
  });
});

app.post("/api/feedback", (req, res) => {
  markApiRequest("feedback");
  const score = Number(req.body?.score);
  if (!Number.isFinite(score) || score < 1 || score > 5) {
    return sendError(res, 400, "score must be a number between 1 and 5.");
  }

  const feedbackItem = {
    score: Math.round(score),
    sentiment: sanitizeFreeText(req.body?.sentiment, 24) || null,
    comment: sanitizeFreeText(req.body?.comment, 400) || null,
    sessionKey: sanitizeFreeText(req.body?.sessionKey, 180) || null,
    airportCode: sanitizeFreeText(req.body?.airportCode, 6) || null,
    riskLabel: sanitizeFreeText(req.body?.riskLabel, 12) || null,
    at: new Date().toISOString(),
  };

  feedbackStore.push(feedbackItem);
  trimStore(feedbackStore, MAX_FEEDBACK_ITEMS);

  return res.json({
    ok: true,
    recordedAt: feedbackItem.at,
  });
});

app.post("/api/flight-status", (req, res) => {
  markApiRequest("flightStatus");
  const {
    airportCode,
    arrivalTime,
    departureTime,
    airlineCode,
    flightNumber,
    connectionType,
    sessionKey: sessionKeyInput,
  } = req.body || {};

  if (!airportCode || !departureTime) {
    return sendError(res, 400, "airportCode and departureTime are required.");
  }

  const departureDate = new Date(departureTime);
  if (Number.isNaN(departureDate.getTime())) {
    return sendError(res, 400, "departureTime must be a valid date/time.");
  }

  const airport = getAirportConfig(airportCode);
  if (!airport) {
    return sendError(res, 400, `Unsupported airport code: ${airportCode}`);
  }

  const arrivalDate = arrivalTime ? new Date(arrivalTime) : null;
  const normalizedAirlineCode = normalizeTicketField(airlineCode, { maxLength: 3 }) || null;
  const normalizedFlightNumber = normalizeTicketField(flightNumber, { maxLength: 6 }) || null;
  const sessionKey =
    sanitizeFreeText(sessionKeyInput, 180) ||
    buildSessionKey({
      airportCode,
      arrivalTime: arrivalDate || new Date(),
      departureTime: departureDate,
      airlineCode: normalizedAirlineCode,
      flightNumber: normalizedFlightNumber,
      connectionType,
    });

  const flight = getFlightStatus({
    airlineCode: normalizedAirlineCode,
    flightNumber: normalizedFlightNumber,
    airportCode: airport.code,
    arrivalTime: arrivalDate || new Date(),
    departureTime: departureDate,
  });

  if (flight.replan?.recommended) {
    apiUsage.planAutoReplans += 1;
    appendReplanHistory(sessionKey, {
      source: "flight-status",
      trigger: flight.replan.trigger,
      statusLabel: flight.statusLabel,
      gate: flight.gate,
      delayMinutes: flight.delayMinutes,
      reason: flight.replan.reason,
      at: new Date().toISOString(),
    });
  }

  return res.json({
    meta: {
      generatedAt: new Date().toISOString(),
      apiVersion: pkg.version,
    },
    sessionKey,
    flight,
    replanHistory: getReplanHistory(sessionKey, 12),
  });
});

app.get("/api/replan-history", (req, res) => {
  markApiRequest("replanHistory");
  const sessionKey = sanitizeFreeText(req.query?.sessionKey, 180);
  if (!sessionKey) {
    return sendError(res, 400, "sessionKey is required.");
  }
  const limit = Math.max(1, Math.min(30, Number(req.query?.limit) || 12));
  return res.json({
    meta: {
      generatedAt: new Date().toISOString(),
      apiVersion: pkg.version,
    },
    sessionKey,
    entries: getReplanHistory(sessionKey, limit),
  });
});

app.post("/api/plan", async (req, res) => {
  markApiRequest("plan");
  const startedAt = Date.now();
  const finishPlanUsage = ({ status, error = null, includeDurationInAverage = false }) => {
    const durationMs = Date.now() - startedAt;
    apiUsage.planLastDurationMs = durationMs;
    apiUsage.planLastStatus = status;
    apiUsage.planLastAt = new Date().toISOString();
    apiUsage.planLastError = error;
    if (includeDurationInAverage) {
      apiUsage.planTotalDurationMs += durationMs;
    }
  };

  const sendPlanError = (statusCode, message, details) => {
    apiUsage.planErrors += 1;
    finishPlanUsage({
      status: statusCode < 500 ? "failed-validation" : "failed-server",
      error: message,
      includeDurationInAverage: false,
    });
    return sendError(res, statusCode, message, details);
  };

  try {
    const {
      airportCode,
      arrivalTime,
      departureTime,
      connectionType,
      interests,
      airlineCode,
      flightNumber,
      riskProfile,
      strategyPack,
      trustAcknowledged,
      sessionKey: sessionKeyInput,
    } = req.body || {};

    if (!airportCode || !arrivalTime || !departureTime || !connectionType) {
      return sendPlanError(
        400,
        "airportCode, arrivalTime, departureTime, and connectionType are required."
      );
    }
    if (trustAcknowledged !== true) {
      return sendPlanError(
        400,
        "trustAcknowledged must be true before generating a plan."
      );
    }

    const airport = getAirportConfig(airportCode);
    if (!airport) {
      return sendPlanError(400, `Unsupported airport code: ${airportCode}`);
    }

    if (!["domestic", "international"].includes(connectionType)) {
      return sendPlanError(400, "connectionType must be domestic or international.");
    }

    const departureDate = new Date(departureTime);
    if (Number.isNaN(departureDate.getTime())) {
      return sendPlanError(400, "departureTime must be a valid date/time.");
    }

    if (departureDate.getTime() <= Date.now()) {
      return sendPlanError(400, "departureTime must be in the future.");
    }

    const arrivalDate = new Date(arrivalTime);
    if (Number.isNaN(arrivalDate.getTime())) {
      return sendPlanError(400, "arrivalTime must be a valid date/time.");
    }
    if (arrivalDate.getTime() >= departureDate.getTime()) {
      return sendPlanError(400, "arrivalTime must be before departureTime.");
    }

    const normalizedInterests = Array.isArray(interests)
      ? interests.filter((item) => INTEREST_CONFIG[item])
      : [];
    const normalizedAirlineCode = normalizeTicketField(airlineCode, { maxLength: 3 }) || null;
    const normalizedFlightNumber = normalizeTicketField(flightNumber, { maxLength: 6 }) || null;
    const normalizedRiskProfile = normalizeRiskProfile(riskProfile);
    const normalizedStrategyPack = normalizeStrategyPack(strategyPack);
    const sessionKey =
      sanitizeFreeText(sessionKeyInput, 180) ||
      buildSessionKey({
        airportCode: airport.code,
        connectionType,
        arrivalTime: arrivalDate,
        departureTime: departureDate,
        airlineCode: normalizedAirlineCode,
        flightNumber: normalizedFlightNumber,
      });

    const result = await buildLayoverPlan({
      airport,
      arrivalTime: arrivalDate,
      departureTime: departureDate,
      connectionType,
      interests: normalizedInterests,
      riskProfile: normalizedRiskProfile,
      strategyPack: normalizedStrategyPack,
      airlineCode: normalizedAirlineCode,
      flightNumber: normalizedFlightNumber,
    });
    const flight = getFlightStatus({
      airlineCode: normalizedAirlineCode,
      flightNumber: normalizedFlightNumber,
      airportCode: airport.code,
      arrivalTime: arrivalDate,
      departureTime: departureDate,
    });

    if (flight.replan?.recommended) {
      apiUsage.planAutoReplans += 1;
      appendReplanHistory(sessionKey, {
        source: "plan",
        trigger: flight.replan.trigger,
        statusLabel: flight.statusLabel,
        gate: flight.gate,
        delayMinutes: flight.delayMinutes,
        reason: flight.replan.reason,
        at: new Date().toISOString(),
      });
    }

    finishPlanUsage({
      status: "success",
      includeDurationInAverage: true,
      error: null,
    });

    return res.json({
      meta: {
        generatedAt: new Date().toISOString(),
        apiVersion: pkg.version,
      },
      ...result,
      session: {
        key: sessionKey,
        riskProfile: normalizedRiskProfile,
        strategyPack: normalizedStrategyPack,
        trustAcknowledged: true,
      },
      flight,
      replanHistory: getReplanHistory(sessionKey, 12),
      observability: {
        generatedInMs: Date.now() - startedAt,
        mapsRuntime: getMapsRuntimeStats(),
      },
    });
  } catch (error) {
    apiUsage.planErrors += 1;
    finishPlanUsage({
      status: "failed-server",
      includeDurationInAverage: false,
      error: error.message,
    });
    return sendError(res, 500, "Failed to build itinerary.", error.message);
  }
});

app.use("/api", (_req, res) => {
  return sendError(res, 404, "API route not found.");
});

app.listen(port, host, () => {
  console.log(`LayoverPlus running on http://${host}:${port}`);
});
