const express = require("express");
const path = require("path");
const pkg = require("./package.json");
const {
  AIRPORTS,
  INTEREST_CONFIG,
  getAirportConfig,
} = require("./src/config/airports");
const { buildLayoverPlan } = require("./src/services/itineraryService");

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";

function sendError(res, statusCode, message, details) {
  return res.status(statusCode).json({
    error: message,
    ...(details ? { details } : {}),
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    name: pkg.name,
    version: pkg.version,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    meta: {
      generatedAt: new Date().toISOString(),
      apiVersion: pkg.version,
    },
    airports: AIRPORTS,
    interests: INTEREST_CONFIG,
  });
});

app.post("/api/plan", async (req, res) => {
  try {
    const { airportCode, departureTime, connectionType, interests } = req.body || {};

    if (!airportCode || !departureTime || !connectionType) {
      return sendError(
        res,
        400,
        "airportCode, departureTime, and connectionType are required."
      );
    }

    const airport = getAirportConfig(airportCode);
    if (!airport) {
      return sendError(res, 400, `Unsupported airport code: ${airportCode}`);
    }

    if (!["domestic", "international"].includes(connectionType)) {
      return sendError(res, 400, "connectionType must be domestic or international.");
    }

    const departureDate = new Date(departureTime);
    if (Number.isNaN(departureDate.getTime())) {
      return sendError(res, 400, "departureTime must be a valid date/time.");
    }

    if (departureDate.getTime() <= Date.now()) {
      return sendError(res, 400, "departureTime must be in the future.");
    }

    const normalizedInterests = Array.isArray(interests)
      ? interests.filter((item) => INTEREST_CONFIG[item])
      : [];

    const result = await buildLayoverPlan({
      airport,
      departureTime: departureDate,
      connectionType,
      interests: normalizedInterests,
    });

    return res.json({
      meta: {
        generatedAt: new Date().toISOString(),
        apiVersion: pkg.version,
      },
      ...result,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to build itinerary.", error.message);
  }
});

app.use("/api", (_req, res) => {
  return sendError(res, 404, "API route not found.");
});

app.listen(port, host, () => {
  console.log(`LayoverPlus running on http://${host}:${port}`);
});
