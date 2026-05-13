const logger = require("../utils/logger");

const DEFAULT_MODEL = "gemini-2.0-flash";

function buildFallbackAiPlan({
  schedule,
  narrative,
  airport,
  selectedPoi,
  feasibility,
  summary,
  connectionType,
}) {
  const travelerTips = [];

  const code = airport?.code || "your airport";
  const poiName = selectedPoi?.name || null;
  const category = selectedPoi?.category || null;
  const slack = Number.isFinite(feasibility?.slackMinutes) ? feasibility.slackMinutes : null;
  const processingMin = Number.isFinite(summary?.processingMinutes) ? summary.processingMinutes : null;
  const returnBuffer = Number.isFinite(summary?.returnBufferMinutes) ? summary.returnBufferMinutes : null;
  const oneWay = Number.isFinite(selectedPoi?.outboundMinutes) ? selectedPoi.outboundMinutes : null;
  const dwell = Number.isFinite(selectedPoi?.dwellMinutes) ? selectedPoi.dwellMinutes : null;
  const inbound = Number.isFinite(selectedPoi?.inboundMinutes) ? selectedPoi.inboundMinutes : null;
  const layoverMinutes = Number.isFinite(summary?.layoverMinutes) ? summary.layoverMinutes : null;

  if (poiName) {
    if (oneWay != null) {
      travelerTips.push(
        `Take a rideshare from ${code} to ${poiName} — budget about ${oneWay} minutes one-way and screenshot the address before you go.`
      );
    }
    if (dwell != null) {
      travelerTips.push(
        `You have roughly ${dwell} minutes at ${poiName} — pick one focused activity rather than rushing between several.`
      );
    }
    if (inbound != null && returnBuffer != null) {
      travelerTips.push(
        `Start the return trip when you have ${inbound + returnBuffer} minutes left — that covers the ${inbound}-minute drive plus the ${returnBuffer}-minute airport buffer.`
      );
    }
    if (slack != null) {
      travelerTips.push(
        `Your plan has ${slack} minutes of slack. If anything (traffic, security line) chews into that, pivot back to ${code} immediately.`
      );
    }
    if (category) {
      const categoryTip = categorySpecificTip(category, poiName);
      if (categoryTip) travelerTips.push(categoryTip);
    }
    if (connectionType === "international" && processingMin != null) {
      travelerTips.push(
        `International returns at ${code} typically need ${processingMin} minutes of processing — count that on top of security on the way back in.`
      );
    } else if (processingMin != null) {
      travelerTips.push(
        `Re-entry at ${code} needs about ${processingMin} minutes for security and gate access — keep that window untouched.`
      );
    }
    travelerTips.push(
      `Save the airport's terminal entrance pin in your maps app before leaving so the rideshare drops you at the right curb on return.`
    );
  } else {
    if (layoverMinutes != null) {
      travelerTips.push(
        `This ${layoverMinutes}-minute window at ${code} is best spent inside the terminal — off-airport doesn't pencil out safely.`
      );
    }
    if (processingMin != null) {
      travelerTips.push(
        `Re-entry processing at ${code} runs ~${processingMin} minutes. Treat that as your hard floor before boarding.`
      );
    }
    travelerTips.push(
      `Walk a circuit of your terminal first — sit-down food, a lounge day pass, and a quiet gate are usually all within 10 minutes of each other.`
    );
    travelerTips.push(
      `Pre-clear any document checks (eGate, passport scan, boarding pass on phone) so the boarding window isn't where you discover a problem.`
    );
    travelerTips.push(
      `Top up water and snacks past security — no point eating into return buffer on a vending-machine hunt later.`
    );
    travelerTips.push(
      `Find your departure gate first, then circle back to anywhere else — a moved gate is the most common surprise on a layover.`
    );
  }

  return {
    provider: "fallback",
    model: null,
    used: false,
    latencyMs: 0,
    title: null,
    narrative,
    schedule,
    travelerTips: travelerTips.slice(0, 7),
    error: null,
  };
}

function categorySpecificTip(category, poiName) {
  const key = String(category || "").toLowerCase();
  if (key === "beach") {
    return `Check wind and tide before going — beaches near airports can be cold and walking the sand line eats time. Wear something you can rinse off.`;
  }
  if (key === "peak" || key === "viewpoint" || key === "cliff") {
    return `Confirm the parking/trailhead pin on a map app and ask the driver to drop you at the upper lot if there is one — saves climbing minutes.`;
  }
  if (key === "nature_reserve" || key === "garden") {
    return `Stick to a single loop trail at ${poiName} — out-and-back routes are easier to time than branching networks.`;
  }
  if (key === "museum" || key === "gallery" || key === "aquarium" || key === "zoo") {
    return `Buy timed-entry tickets on your phone before the ride — skipping the box-office line at ${poiName} can claw back 15+ minutes.`;
  }
  if (key === "restaurant" || key === "cafe" || key === "food_court" || key === "bar" || key === "pub" || key === "biergarten") {
    return `Sit at the bar or counter at ${poiName} for faster service, or order ahead — full table service rarely fits a layover window.`;
  }
  if (key === "monument" || key === "memorial" || key === "castle" || key === "ruins" || key === "attraction" || key === "artwork") {
    return `Walk the perimeter of ${poiName} first, then go inside if open — exteriors photograph well and don't need a queue.`;
  }
  if (key === "mall" || key === "department_store" || key === "marketplace") {
    return `Stick to one wing of ${poiName} and a written list — malls swallow time and no one wants to lug bags back through security.`;
  }
  return null;
}

function extractGeminiText(data) {
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function parseJsonResponse(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("AI response did not contain JSON.");
    }
    return JSON.parse(match[0]);
  }
}

function normalizeSchedule(baseSchedule, aiSchedule) {
  if (!Array.isArray(aiSchedule)) {
    return baseSchedule;
  }

  return baseSchedule.map((baseItem, index) => {
    const aiItem = aiSchedule[index] || {};
    return {
      ...baseItem,
      label:
        typeof aiItem.label === "string" && aiItem.label.trim()
          ? aiItem.label.trim()
          : baseItem.label,
      reason:
        typeof aiItem.reason === "string" && aiItem.reason.trim()
          ? aiItem.reason.trim()
          : baseItem.reason,
    };
  });
}

const GENERIC_TIP_PATTERNS = [
  /^keep the return buffer/i,
  /^stay aware/i,
  /^use a predictable ride/i,
  /^be mindful/i,
  /^don'?t miss your flight/i,
  /^check your gate/i,
];

function normalizeTips(tips) {
  if (!Array.isArray(tips)) {
    return [];
  }

  const cleaned = tips
    .filter((tip) => typeof tip === "string")
    .map((tip) => tip.trim())
    .filter((tip) => tip.length >= 12 && tip.length <= 220);

  // Drop generic-sounding tips when we have enough specific ones.
  const specific = cleaned.filter(
    (tip) => !GENERIC_TIP_PATTERNS.some((pattern) => pattern.test(tip))
  );
  const ordered = specific.length >= 5 ? specific : cleaned;

  // Dedupe by case-insensitive prefix.
  const seen = new Set();
  const result = [];
  for (const tip of ordered) {
    const key = tip.slice(0, 40).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tip);
    if (result.length >= 8) break;
  }
  return result;
}

function buildPrompt(payload) {
  const poi = payload?.selectedPoi || null;
  const poiLine = poi
    ? `The selected stop is ${poi.name}${poi.category ? ` (${poi.category})` : ""}${poi.address ? ` at ${poi.address}` : ""}.`
    : "There is no off-airport stop — guidance must be airport-only.";

  return `
Generate the traveler-facing parts of a layover itinerary as strict JSON.

Rules:
- Use only the structured data below.
- Do not invent airports, places, travel times, timestamps, safety buffers, or risk labels.
- Preserve every schedule block's start, end, minutes, and location exactly.
- You may rewrite only schedule labels, add a reason for each block, write a narrative, write a concise title, and add traveler tips.

Traveler tips requirements (STRICT):
- Return AT LEAST 5 tips. Aim for 5–7. No more than 8.
- ${poiLine}
- EVERY tip must mention either the exact stop name, its category/neighborhood, or a specific number from the structured data (slack minutes, dwell minutes, processing minutes, return buffer, layover minutes, one-way travel minutes).
- Do NOT write generic advice. Reject phrases like "stay aware", "be mindful", "keep your phone charged", "don't miss your flight", "use a predictable ride option", "check your gate". If you find yourself writing those, replace them with concrete, plan-specific actions.
- Tip topics to cover (pick the ones that fit; you may add others if they are plan-specific):
  1. Ride strategy from THIS airport to THIS stop, including the one-way travel minutes.
  2. What to do at the stop given the dwell window in minutes (concrete activity, not "explore the area").
  3. Return-trip timing tied to the inbound minutes and the return buffer minutes.
  4. A safety-margin reminder that references the slack minutes number.
  5. Something specific to the stop's CATEGORY (e.g. beaches → tide/wind/parking; museums → opening hours/coat check; viewpoints → best photo angle; restaurants → order-ahead/seated vs. counter; hikes → trail-loop length and footwear).
  6. Connection-type-specific note when relevant (domestic vs. international processing time).
  7. A weather-, time-of-day-, or daylight-aware note if it sensibly applies to the schedule window.
- Each tip: 12–28 words, action-oriented, written in second person ("Take ...", "Plan to ...", "If ...").

If there is no selected POI, the tips must explain that staying inside the airport is the safer plan AND give 5+ specific airport-side actions tied to the structured numbers (processing minutes, layover minutes, gate, food/rest options at THIS airport by code).

Return only JSON with this exact shape:
{
  "title": "short title",
  "narrative": "2-4 sentence explanation",
  "schedule": [
    {
      "label": "traveler-facing schedule label",
      "reason": "why this block matters"
    }
  ],
  "travelerTips": ["tip 1", "tip 2", "tip 3", "tip 4", "tip 5"]
}

Structured data:
${JSON.stringify(payload, null, 2)}
`.trim();
}

async function generateAiSchedule({
  airport,
  connectionType,
  interests,
  feasibility,
  summary,
  selectedPoi,
  schedule,
  fallbackNarrative,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const startedAt = Date.now();

  if (!apiKey || apiKey === "replace_with_your_api_key_here") {
    const result = {
      ...buildFallbackAiPlan({
        schedule,
        narrative: fallbackNarrative,
        airport,
        selectedPoi,
        feasibility,
        summary,
        connectionType,
      }),
      error: "GEMINI_API_KEY is not configured.",
    };
    logger.info(
      { provider: result.provider, model: null, used: false, latencyMs: 0, error: result.error },
      "ai_schedule_call"
    );
    return result;
  }

  const payload = {
    airport: {
      code: airport.code,
      name: airport.name,
      city: airport.city,
    },
    connectionType,
    interests,
    feasibility,
    summary,
    selectedPoi,
    schedule,
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(payload) }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini request failed with ${response.status}`);
    }

    const parsed = parseJsonResponse(extractGeminiText(data));
    const narrative =
      typeof parsed.narrative === "string" && parsed.narrative.trim()
        ? parsed.narrative.trim()
        : fallbackNarrative;
    const latencyMs = Date.now() - startedAt;

    const result = {
      provider: "gemini",
      model,
      used: true,
      latencyMs,
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : null,
      narrative,
      schedule: normalizeSchedule(schedule, parsed.schedule),
      travelerTips: normalizeTips(parsed.travelerTips),
      error: null,
    };
    logger.info(
      { provider: result.provider, model: result.model, used: true, latencyMs, error: null },
      "ai_schedule_call"
    );
    return result;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const result = {
      ...buildFallbackAiPlan({
        schedule,
        narrative: fallbackNarrative,
        airport,
        selectedPoi,
        feasibility,
        summary,
        connectionType,
      }),
      latencyMs,
      error: error.message,
    };
    logger.info(
      { provider: result.provider, model, used: false, latencyMs, error: error.message },
      "ai_schedule_call"
    );
    return result;
  }
}

module.exports = {
  generateAiSchedule,
};
