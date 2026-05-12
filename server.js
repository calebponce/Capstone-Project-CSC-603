const { loadEnvFile } = require("./src/config/env");
const express = require("express");
const { signup, login, verifyToken, users } = require("./src/server/auth");
const fs = require("fs");
const path = require("path");
const pkg = require("./package.json");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const pinoHttp = require("pino-http");
const logger = require("./src/utils/logger");
const errorHandler = require("./src/middleware/errorHandler");
const { planSchema } = require("./src/schema/planSchema");
const { flightSchema } = require("./src/schema/flightSchema");
const { AIRPORTS, INTEREST_CONFIG, getAirportConfig } = require("./src/config/airports");
const { buildLayoverPlan } = require("./src/services/itineraryService");
const { getFlightStatus } = require("./src/services/flightService");
const { getMapsRuntimeStats } = require("./src/services/mapsService");
const {
  getPlacePreview,
  getGooglePlacesApiKey,
  getYelpApiKey,
} = require("./src/services/placePreviewService");

loadEnvFile();

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";
const distPath = path.join(__dirname, "dist");
const publicPath = path.join(__dirname, "public");
const hasClientBuild = fs.existsSync(path.join(distPath, "index.html"));
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
  placePreview: 0,
  placePhoto: 0,
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
  return [
    "standard",
    "food-first",
    "culture-deep",
    "recharge",
    "local-gems",
    "scenic-balance",
  ].includes(value)
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

function sanitizePreferredPoi(preferredPoiInput) {
  if (!preferredPoiInput || typeof preferredPoiInput !== "object") {
    return null;
  }
  const name = sanitizeFreeText(preferredPoiInput.name, 120);
  const lat = Number(preferredPoiInput.lat);
  const lon = Number(preferredPoiInput.lon);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return {
    name,
    lat,
    lon,
    category: sanitizeFreeText(preferredPoiInput.category, 80) || null,
    address: sanitizeFreeText(preferredPoiInput.address, 180) || null,
  };
}

function sanitizeGooglePhotoName(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("places/") || !raw.includes("/photos/")) {
    return null;
  }
  // Restrict to expected path characters.
  if (!/^[A-Za-z0-9/_-]+$/.test(raw)) {
    return null;
  }
  return raw.slice(0, 220);
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

// ---- Security & Hardening Middleware ----
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabling CSP for now to prevent breaking existing inline scripts/styles if any
  })
);
app.use(cors());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

// ---- Logging Middleware ----
app.use(pinoHttp({ logger }));

// ---- Body Parsers ----
app.use(express.json());
if (hasClientBuild) {
  app.use(express.static(distPath));
}
app.use(express.static(publicPath));

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

// ---- Auth Routes ----
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    const token = await signup(email, password);
    res.json({ token, email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const token = await login(email, password);
    res.json({ token, email });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get("/api/vault", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const decoded = verifyToken(authHeader.split(" ")[1]);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  
  const user = users.find(u => u.id === decoded.id);
  res.json({ savedPlans: user?.savedPlans || [] });
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
    successfulPlans > 0 ? Math.round(apiUsage.planTotalDurationMs / successfulPlans) : null;
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
      placePreviewRequests: apiUsage.placePreview,
      placePhotoRequests: apiUsage.placePhoto,
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

app.get("/api/place-preview", async (req, res) => {
  markApiRequest("placePreview");
  const name = sanitizeFreeText(req.query?.name, 120);
  const lat = Number(req.query?.lat);
  const lon = Number(req.query?.lon);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return sendError(res, 400, "name, lat, and lon are required.");
  }

  const preview = await getPlacePreview({ name, lat, lon });
  if (!preview) {
    return sendError(res, 404, "No place preview available.");
  }

  return res.json({
    meta: {
      generatedAt: new Date().toISOString(),
      apiVersion: pkg.version,
      googlePlacesEnabled: Boolean(getGooglePlacesApiKey()),
      yelpEnabled: Boolean(getYelpApiKey()),
    },
    preview,
  });
});

app.get("/api/place-photo", async (req, res) => {
  markApiRequest("placePhoto");
  const provider = sanitizeFreeText(req.query?.provider, 24).toLowerCase();
  if (provider !== "google") {
    return sendError(res, 400, "Only provider=google is supported for photo proxy.");
  }

  const photoName = sanitizeGooglePhotoName(req.query?.photoName);
  if (!photoName) {
    return sendError(res, 400, "Valid Google photoName is required.");
  }

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return sendError(res, 503, "Google Places API key is not configured.");
  }

  const maxWidthPx = Math.max(260, Math.min(1280, Number(req.query?.maxWidthPx) || 960));
  const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}`;

  try {
    const response = await fetch(photoUrl, {
      headers: {
        "X-Goog-Api-Key": apiKey,
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return sendError(res, response.status, `Place photo fetch failed (${response.status}).`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const cacheControl = response.headers.get("cache-control") || "public, max-age=900";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControl);
    return res.send(buffer);
  } catch (_error) {
    return sendError(res, 502, "Unable to fetch place photo.");
  }
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

app.post("/api/flight-status", (req, res, next) => {
  markApiRequest("flightStatus");
  try {
    const validatedData = flightSchema.parse(req.body || {});
    const {
      airportCode,
      arrivalTime,
      departureTime,
      airlineCode,
      flightNumber,
      connectionType,
      sessionKey: sessionKeyInput,
    } = validatedData;

    const airport = getAirportConfig(airportCode);
    const arrivalDate = arrivalTime ? new Date(arrivalTime) : null;
    const normalizedAirlineCode = normalizeTicketField(airlineCode, { maxLength: 3 }) || null;
    const normalizedFlightNumber = normalizeTicketField(flightNumber, { maxLength: 6 }) || null;
    const sessionKey =
      sanitizeFreeText(sessionKeyInput, 180) ||
      buildSessionKey({
        airportCode,
        arrivalTime: arrivalDate || new Date(),
        departureTime: new Date(departureTime),
        airlineCode: normalizedAirlineCode,
        flightNumber: normalizedFlightNumber,
        connectionType,
      });

    const flight = getFlightStatus({
      airlineCode: normalizedAirlineCode,
      flightNumber: normalizedFlightNumber,
      airportCode: airport.code,
      arrivalTime: arrivalDate || new Date(),
      departureTime: new Date(departureTime),
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
  } catch (error) {
    next(error);
  }
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

app.post("/api/plan", async (req, res, next) => {
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

  try {
    const validatedData = planSchema.parse(req.body || {});
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
      preferredPoiName,
      preferredPoi,
      trustAcknowledged,
      sessionKey: sessionKeyInput,
    } = validatedData;

    const airport = getAirportConfig(airportCode);
    const departureDate = new Date(departureTime);
    const arrivalDate = new Date(arrivalTime);

    const normalizedInterests = Array.isArray(interests)
      ? interests.filter((item) => INTEREST_CONFIG[item])
      : [];
    const normalizedAirlineCode = normalizeTicketField(airlineCode, { maxLength: 3 }) || null;
    const normalizedFlightNumber = normalizeTicketField(flightNumber, { maxLength: 6 }) || null;
    const normalizedRiskProfile = normalizeRiskProfile(riskProfile);
    const normalizedStrategyPack = normalizeStrategyPack(strategyPack);
    const normalizedPreferredPoiName = sanitizeFreeText(preferredPoiName, 120) || null;
    const normalizedPreferredPoi = sanitizePreferredPoi(preferredPoi);
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
      preferredPoiName: normalizedPreferredPoiName,
      preferredPoi: normalizedPreferredPoi,
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

    const planResult = {
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
    };

    // Save to Vault if requested and user is authenticated
    if (req.body.saveToVault) {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
      const decoded = token ? verifyToken(token) : null;
      const user = decoded ? users.find((u) => u.id === decoded.id) : null;
      if (user) {
        user.savedPlans = user.savedPlans || [];
        user.savedPlans.unshift({
          id: Date.now(),
          title: planResult.ai?.title || "Layover Plan",
          airportCode: planResult.request.airportCode,
          generatedAt: new Date().toISOString(),
          plan: planResult,
        });
        user.savedPlans = user.savedPlans.slice(0, 20);
      } else {
        logger.warn(
          { hasToken: Boolean(token), tokenValid: Boolean(decoded) },
          "vault_save_skipped_unauthenticated"
        );
      }
    }

    return res.json(planResult);
  } catch (error) {
    if (error.name === "ZodError") {
      apiUsage.planErrors += 1;
      finishPlanUsage({
        status: "failed-validation",
        error: "Validation failed",
        includeDurationInAverage: false,
      });
    } else {
      apiUsage.planErrors += 1;
      finishPlanUsage({
        status: "failed-server",
        error: error.message,
        includeDurationInAverage: false,
      });
    }
    next(error);
  }
});

app.use("/api", (_req, res) => {
  return sendError(res, 404, "API route not found.");
});

if (hasClientBuild) {
  app.get("*", (_req, res) => {
    return res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    return res.status(503).json({
      error: "Client build not found.",
      details: "Run `npm run build` for production or `npm run dev:client` for local frontend dev.",
    });
  });
}

// ---- Global Error Handler ----
app.use(errorHandler);

app.listen(port, host, () => {
  logger.info(`LayoverPlus running on http://${host}:${port}`);
});
