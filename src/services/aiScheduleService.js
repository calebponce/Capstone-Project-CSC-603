const DEFAULT_MODEL = "gpt-4.1-mini";

function buildFallbackAiPlan({ schedule, narrative }) {
  const travelerTips = schedule.length
    ? [
        "Keep the return buffer intact.",
        "Use a predictable ride option for off-airport travel.",
        "Stay at the airport if the plan starts feeling tight.",
      ]
    : [
        "Stay inside the airport for this connection.",
        "Use the extra time for food, rest, or terminal services.",
        "Do not reduce the return buffer for an off-airport stop.",
      ];

  return {
    provider: "fallback",
    model: null,
    used: false,
    title: null,
    narrative,
    schedule,
    travelerTips,
    error: null,
  };
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const output = Array.isArray(data.output) ? data.output : [];
  return output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((content) => content.text || "")
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

function normalizeTips(tips) {
  if (!Array.isArray(tips)) {
    return [];
  }

  return tips
    .filter((tip) => typeof tip === "string" && tip.trim())
    .map((tip) => tip.trim())
    .slice(0, 4);
}

function buildPrompt(payload) {
  return `
Generate the traveler-facing parts of a layover itinerary as strict JSON.

Rules:
- Use only the structured data below.
- Do not invent airports, places, travel times, timestamps, safety buffers, or risk labels.
- Preserve every schedule block's start, end, minutes, and location exactly.
- You may rewrite only schedule labels, add a reason for each block, write a narrative, write a concise title, and add traveler tips.
- If there is no selected POI, explain that staying inside the airport is the safer plan.
- Return only JSON with this exact shape:
{
  "title": "short title",
  "narrative": "2-4 sentence explanation",
  "schedule": [
    {
      "label": "traveler-facing schedule label",
      "reason": "why this block matters"
    }
  ],
  "travelerTips": ["tip 1", "tip 2", "tip 3"]
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
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  if (!apiKey || apiKey === "replace_with_your_api_key_here") {
    return {
      ...buildFallbackAiPlan({ schedule, narrative: fallbackNarrative }),
      error: "OPENAI_API_KEY is not configured.",
    };
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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: buildPrompt(payload),
        temperature: 0.3,
        max_output_tokens: 900,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `OpenAI request failed with ${response.status}`);
    }

    const parsed = parseJsonResponse(extractResponseText(data));
    const narrative =
      typeof parsed.narrative === "string" && parsed.narrative.trim()
        ? parsed.narrative.trim()
        : fallbackNarrative;

    return {
      provider: "openai",
      model,
      used: true,
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : null,
      narrative,
      schedule: normalizeSchedule(schedule, parsed.schedule),
      travelerTips: normalizeTips(parsed.travelerTips),
      error: null,
    };
  } catch (error) {
    return {
      ...buildFallbackAiPlan({ schedule, narrative: fallbackNarrative }),
      error: error.message,
    };
  }
}

module.exports = {
  generateAiSchedule,
};
