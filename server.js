const express = require("express");
const path = require("path");
const {
  AIRPORTS,
  INTEREST_CONFIG,
  getAirportConfig,
} = require("./src/config/airports");
const { buildLayoverPlan } = require("./src/services/itineraryService");

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config", (_req, res) => {
  res.json({
    airports: AIRPORTS,
    interests: INTEREST_CONFIG,
  });
});

app.post("/api/plan", async (req, res) => {
  try {
    const { airportCode, departureTime, connectionType, interests } = req.body || {};

    if (!airportCode || !departureTime || !connectionType) {
      return res.status(400).json({
        error: "airportCode, departureTime, and connectionType are required.",
      });
    }

    const airport = getAirportConfig(airportCode);
    if (!airport) {
      return res.status(400).json({
        error: `Unsupported airport code: ${airportCode}`,
      });
    }

    if (!["domestic", "international"].includes(connectionType)) {
      return res.status(400).json({
        error: "connectionType must be domestic or international.",
      });
    }

    const departureDate = new Date(departureTime);
    if (Number.isNaN(departureDate.getTime())) {
      return res.status(400).json({
        error: "departureTime must be a valid date/time.",
      });
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

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to build itinerary.",
      details: error.message,
    });
  }
});

app.listen(port, host, () => {
  console.log(`LayoverPlus running on http://${host}:${port}`);
});
