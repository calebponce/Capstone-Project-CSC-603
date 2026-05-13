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
    candidateProsConsByName: {},
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
  const candidateSummaries = candidates.map((c) => {
    const signals = [];
    if (c.poi?.wikidata) signals.push("wikidata");
    if (c.poi?.wikipedia) signals.push("wikipedia");
    if (c.poi?.isHeritage) signals.push("heritage");
    if (c.poi?.hasWebsite) signals.push("website");
    if (c.poi?.hasHours) signals.push("opening_hours");
    return {
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
      notability: Number.isFinite(c.poi?.notability) ? c.poi.notability : 0,
      notabilitySignals: signals,
    };
  });

  return `
You are choosing ONE point of interest for a traveler's layover from a pre-filtered, feasibility-checked shortlist. Also explain the layover risk in plain language and write a short blurb for each candidate.

Hard constraints:
- You MUST pick a candidate from the provided list by its exact "name" field. Do not invent a place.
- Do not lower or change any numeric values (slack, processing time, travel minutes, return buffer, score).
- All distances, times, and safety numbers come from the structured data — do NOT invent them.

Notability is a critical input. Each candidate has a "notability" (integer 0-15) and "notabilitySignals" array (e.g. ["wikidata","wikipedia","heritage","website","opening_hours"]). High notability = the place is well-known, curated, or culturally significant. Low notability = obscure geographic feature, generic park, or unverifiable venue. ALWAYS prefer higher-notability candidates UNLESS the risk profile or feasibility math overrides. If two candidates have similar feasibility, the one with more notability signals is the better pick.

CRITICAL — User-facing copy rules:
- The "notability" number, "notabilitySignals", and signal names ("wikidata", "wikipedia", "heritage", "OSM", "score", "feasibility score") are INTERNAL. NEVER mention them in any user-facing text (blurb, pros, cons, rationale, riskExplainer).
- Translate signals into experiential language a traveler cares about. Examples:
    * wikidata/wikipedia → "well-known landmark", "famous viewpoint", "iconic"
    * heritage → "historically significant", "protected heritage site"
    * website + opening_hours → "established venue with set hours"
    * tourism=attraction → "a recognized visitor attraction"
    * boundary=national_park → "official national/state park"
- The blurb and pros should describe WHAT THE TRAVELER WILL SEE OR DO, not why an algorithm picked it. Speak as a friend recommending the place, not as a system explaining a ranking.

Risk profile decides HOW you pick. Read this carefully:
- "conservative": Pick the SAFEST FEASIBLE option among candidates with notability >= 3. Maximize slackMinutes and minimize one-way travel time. Interest fit is secondary; safety is paramount. Only drop the notability floor if no feasible options clear it.
- "balanced": Pick the candidate with the best combination of notability AND interest fit AND feasibility. Heavily disprefer candidates with notability 0-2 unless nothing else matches the traveler's interests.
- "explorer": Pick the MOST DISTINCTIVE, MEMORABLE option. Prefer the highest-notability candidate that is feasible AND matches the traveler's interests. Specifically prefer candidates that have "wikidata", "wikipedia", or "heritage" signals — these are real destinations a traveler would tell friends about. Strongly AVOID for explorer picks:
    * Candidates with notability 0-2 (forgettable geographic points, no-name parks, unverifiable venues)
    * Libraries, banks, generic shopping plazas, chain coffee shops, utility venues, anything "safe but boring"
  A Medium riskLabel is acceptable if the venue is genuinely memorable. Do NOT default to the closest or highest-feasibility-score pick if a more notable option is feasible.

For EVERY candidate in the input, write:
- A short blurb (12-25 words) describing the place itself — what kind of experience it offers, the vibe, what you can do there. Like a friend giving a recommendation. Do NOT mention scores, rankings, signals, or anything technical.
- 2-3 PROS — concrete reasons a traveler would enjoy THIS place. Each pro must describe something about the place or the experience: views, food, atmosphere, what's nearby, what makes it memorable. You MAY reference one timing fact per candidate (e.g. "quick 15-min ride from the terminal", "leaves plenty of time to wander"), but most pros should be about the place, not the math. NEVER use the words "score", "notability", "signal", "wikidata", "feasibility", or any system terminology.
- 2-3 CONS — honest trade-offs in plain language. Time pressure is fine to mention naturally ("tight return window if traffic snarls", "20-minute ride each way eats into your time"), but lead with experiential downsides where they apply ("limited food on-site", "windy and cold this time of year", "may be crowded mid-day"). NEVER use technical scoring language.
- Selection rationale: name the place and explain WHY a traveler would love it (or why it's the safest call for the profile), in plain language. Never name internal signals.

Return only JSON with this exact shape:
{
  "pickedCandidateName": "must match one of the input candidate names exactly",
  "selectionRationale": "1-2 sentences. Why this pick fits the traveler AND this risk profile. Name the profile in the rationale.",
  "riskExplainer": "1-2 sentences. Plain-language explanation of the layover risk given the slack minutes, processing time, and return buffer.",
  "candidates": {
    "<candidate name>": {
      "blurb": "12-25 words",
      "pros": ["8-15 words each", "...", "..."],
      "cons": ["8-15 words each", "...", "..."]
    }
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
    const candidateProsConsByName = {};
    const normalizeStringList = (value) =>
      Array.isArray(value)
        ? value
            .filter((s) => typeof s === "string" && s.trim())
            .map((s) => s.trim())
            .slice(0, 3)
        : [];

    if (parsed.candidates && typeof parsed.candidates === "object") {
      for (const [name, entry] of Object.entries(parsed.candidates)) {
        if (!candidateNames.has(name) || !entry || typeof entry !== "object") continue;
        if (typeof entry.blurb === "string" && entry.blurb.trim()) {
          candidateBlurbs[name] = entry.blurb.trim();
        }
        const pros = normalizeStringList(entry.pros);
        const cons = normalizeStringList(entry.cons);
        if (pros.length || cons.length) {
          candidateProsConsByName[name] = { pros, cons };
        }
      }
    }
    if (parsed.candidateBlurbs && typeof parsed.candidateBlurbs === "object") {
      for (const [name, blurb] of Object.entries(parsed.candidateBlurbs)) {
        if (typeof blurb === "string" && blurb.trim() && candidateNames.has(name) && !candidateBlurbs[name]) {
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
      candidateProsConsByName,
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
        prosConsCount: Object.keys(candidateProsConsByName).length,
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
