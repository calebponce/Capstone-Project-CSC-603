const logger = require("../utils/logger");

const DEFAULT_MODEL = "gemini-2.5-flash-lite";

function emptyResult({ provider = "fallback", error = null, latencyMs = 0 } = {}) {
  return {
    provider,
    model: null,
    used: false,
    latencyMs,
    pickedCandidateName: null,
    selectionRationale: null,
    riskExplainer: null,
    candidateBlurbs: {},
    error,
  };
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

function extractGeminiText(data) {
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function buildPrompt({ airport, connectionType, interests, riskProfile, feasibility, summary, candidates }) {
  const candidateSummaries = candidates.map((c) => ({
    name: c.poi.name,
    category: c.poi.category || "general",
    address: c.poi.address || "",
    outboundMinutes: c.outboundMinutes,
    inboundMinutes: c.inboundMinutes,
    dwellMinutes: c.dwellMinutes,
    score: c.feasibility.score,
    slackMinutes: c.feasibility.slackMinutes,
    riskLabel: c.feasibility.riskLabel,
    feasible: c.feasibility.feasible,
  }));

  return `
You are choosing ONE point of interest for a traveler's layover from a pre-filtered, feasibility-checked shortlist. Also explain the layover risk in plain language and write a short blurb for each candidate.

Hard constraints:
- You MUST pick a candidate from the provided list by its exact "name" field. Do not invent a place.
- Do not lower or change any numeric values (slack, processing time, travel minutes, return buffer, score).
- All distances, times, and safety numbers come from the structured data — do NOT invent them.

Risk profile decides HOW you pick. Read this carefully:
- "conservative": Pick the SAFEST option. Maximize slackMinutes and minimize one-way travel time. Prefer candidates with riskLabel "Low". Interest fit is secondary; safety is paramount. Avoid anything that feels rushed.
- "balanced": Pick the best overall option — the highest score that still matches the traveler's interests well. Standard trade-off.
- "explorer": Pick the MOST DISTINCTIVE, INTERESTING, OR ADVENTUROUS option that the traveler will remember. Strongly prefer:
    * Unique cultural venues (museums, galleries, neighborhood gems, food halls, historic sites, scenic spots)
    * Categories that match the traveler's stated interests deeply (not generic alternatives)
    * Slightly farther / longer-dwell options if the slack permits
  Strongly AVOID for explorer picks: libraries, banks, generic shopping plazas, chain coffee shops, utility venues, and anything that reads as "safe but boring." A Medium riskLabel is acceptable if the venue is genuinely memorable. Do NOT default to the highest-score pick if a more interesting option is feasible.

Return only JSON with this exact shape:
{
  "pickedCandidateName": "must match one of the input candidate names exactly",
  "selectionRationale": "1-2 sentences. Why this pick fits the traveler AND this risk profile. Name the profile in the rationale.",
  "riskExplainer": "1-2 sentences. Plain-language explanation of the layover risk given the slack minutes, processing time, and return buffer.",
  "candidateBlurbs": {
    "<candidate name>": "12-25 words. Why this candidate fits or doesn't fit the traveler."
  }
}

Structured input:
${JSON.stringify(
  {
    airport: { code: airport.code, name: airport.name, city: airport.city },
    connectionType,
    interests,
    riskProfile,
    feasibility: {
      score: feasibility?.score,
      slackMinutes: feasibility?.slackMinutes,
      riskLabel: feasibility?.riskLabel,
      feasible: feasibility?.feasible,
    },
    summary: {
      processingMinutes: summary?.processingMinutes,
      returnBufferMinutes: summary?.returnBufferMinutes,
      layoverMinutes: summary?.layoverMinutes,
    },
    candidates: candidateSummaries,
  },
  null,
  2
)}
`.trim();
}

async function generateAiSelection({
  airport,
  connectionType,
  interests,
  riskProfile,
  feasibility,
  summary,
  candidates,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const startedAt = Date.now();

  if (!apiKey || apiKey === "replace_with_your_api_key_here") {
    const result = emptyResult({ error: "GEMINI_API_KEY is not configured." });
    logger.info(
      { provider: result.provider, model: null, used: false, latencyMs: 0, error: result.error },
      "ai_selection_call"
    );
    return result;
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return emptyResult({ error: "No candidates to choose from." });
  }

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
          contents: [
            {
              parts: [
                {
                  text: buildPrompt({
                    airport,
                    connectionType,
                    interests,
                    riskProfile,
                    feasibility,
                    summary,
                    candidates,
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 900,
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
    const latencyMs = Date.now() - startedAt;

    const candidateNames = new Set(candidates.map((c) => c.poi.name));
    const pickedCandidateName =
      typeof parsed.pickedCandidateName === "string" && candidateNames.has(parsed.pickedCandidateName.trim())
        ? parsed.pickedCandidateName.trim()
        : null;

    const candidateBlurbs = {};
    if (parsed.candidateBlurbs && typeof parsed.candidateBlurbs === "object") {
      for (const [name, blurb] of Object.entries(parsed.candidateBlurbs)) {
        if (typeof blurb === "string" && blurb.trim() && candidateNames.has(name)) {
          candidateBlurbs[name] = blurb.trim();
        }
      }
    }

    const result = {
      provider: "gemini",
      model,
      used: true,
      latencyMs,
      pickedCandidateName,
      selectionRationale:
        typeof parsed.selectionRationale === "string" && parsed.selectionRationale.trim()
          ? parsed.selectionRationale.trim()
          : null,
      riskExplainer:
        typeof parsed.riskExplainer === "string" && parsed.riskExplainer.trim()
          ? parsed.riskExplainer.trim()
          : null,
      candidateBlurbs,
      error: null,
    };
    logger.info(
      {
        provider: result.provider,
        model: result.model,
        used: true,
        latencyMs,
        picked: pickedCandidateName,
        blurbCount: Object.keys(candidateBlurbs).length,
        error: null,
      },
      "ai_selection_call"
    );
    return result;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const result = emptyResult({ error: error.message, latencyMs });
    logger.info(
      { provider: result.provider, model, used: false, latencyMs, error: error.message },
      "ai_selection_call"
    );
    return result;
  }
}

module.exports = {
  generateAiSelection,
};
