const airportSelect = document.getElementById("airportCode");
const interestsContainer = document.getElementById("interests");
const form = document.getElementById("planner-form");
const statusEl = document.getElementById("status");
const submitButton = form.querySelector("button[type='submit']");
const resetPlannerBtn = document.getElementById("reset-planner");
const copyBriefBtn = document.getElementById("copy-brief");
const exportPlanBtn = document.getElementById("export-plan");
const resultsTopEl = document.getElementById("results-top");

const resultTitle = document.getElementById("result-title");
const riskPill = document.getElementById("risk-pill");
const goNoGoEl = document.getElementById("go-no-go");
const decisionWhyEl = document.getElementById("decision-why");
const scoreBreakdownEl = document.getElementById("score-breakdown");
const scoreEl = document.getElementById("score");
const layoverEl = document.getElementById("layover");
const processingEl = document.getElementById("processing");
const bufferEl = document.getElementById("buffer");
const slackEl = document.getElementById("slack");
const aiProviderEl = document.getElementById("ai-provider");
const narrativeEl = document.getElementById("narrative");
const aiDetailsEl = document.getElementById("ai-details");
const requestMetaEl = document.getElementById("request-meta");
const planUpdatedEl = document.getElementById("plan-updated");
const scheduleEl = document.getElementById("schedule");
const candidatesEl = document.getElementById("candidates");
const safetyChecklistEl = document.getElementById("safety-checklist");
const plannerChecklistEl = document.getElementById("planner-checklist");
const selectedPoiEl = document.getElementById("selected-poi");
const confidenceFillEl = document.getElementById("confidence-fill");
const confidenceLabelEl = document.getElementById("confidence-label");
const arrivalInput = document.getElementById("arrivalTime");
const departureInput = document.getElementById("departureTime");
const layoverWindowEl = document.getElementById("layover-window");
const togglePresentationBtn = document.getElementById("toggle-presentation");
const travelFactEl = document.getElementById("travel-fact");
const nextStepWrapEl = document.getElementById("next-step");
const nextStepTextEl = document.getElementById("next-step-text");
const nextStepBtn = document.getElementById("next-step-btn");
const presetButtons = Array.from(document.querySelectorAll(".preset-btn"));
const scenarioButtons = Array.from(document.querySelectorAll(".scenario-btn"));
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

const apiHealthCard = document.querySelector(".api-health");
const apiStateEl = document.getElementById("api-state");
const apiLatencyEl = document.getElementById("api-latency");
const apiMetaEl = document.getElementById("api-meta");

let map;
let layerGroup;
let candidateMarkers = [];
let lastCandidates = [];
let selectedCandidateIndex = -1;
let lastPlanData = null;
let lastRequestPayload = null;
let activeTab = "decision";
let presentationModeEnabled = false;

const SCENARIOS = {
  "food-sfo": {
    airportCode: "SFO",
    connectionType: "domestic",
    hoursAhead: 5,
    interests: ["food", "shopping"],
  },
  "culture-jfk": {
    airportCode: "JFK",
    connectionType: "domestic",
    hoursAhead: 6,
    interests: ["culture", "sightseeing"],
  },
  "scenic-lax": {
    airportCode: "LAX",
    connectionType: "international",
    hoursAhead: 8,
    interests: ["sightseeing", "food"],
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMinutes(minutes) {
  if (minutes == null || Number.isNaN(minutes)) {
    return "-";
  }
  return `${minutes} min`;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) {
    return "-";
  }
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours <= 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

function toDatetimeLocalValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function setDefaultArrivalTime() {
  const now = new Date();
  now.setSeconds(0, 0);
  const remainder = now.getMinutes() % 15;
  if (remainder !== 0) {
    now.setMinutes(now.getMinutes() + (15 - remainder));
  }
  arrivalInput.value = toDatetimeLocalValue(now);
}

function getValidArrivalBaseTime() {
  const arrivalDate = new Date(arrivalInput.value);
  if (!Number.isNaN(arrivalDate.getTime())) {
    return arrivalDate;
  }
  return new Date();
}

function setDepartureTimeFromHours(hoursAhead) {
  const base = getValidArrivalBaseTime();
  const later = new Date(base.getTime() + hoursAhead * 60 * 60 * 1000);
  later.setSeconds(0, 0);
  const remainder = later.getMinutes() % 15;
  if (remainder !== 0) {
    later.setMinutes(later.getMinutes() + (15 - remainder));
  }
  departureInput.value = toDatetimeLocalValue(later);
}

function setDefaultDepartureTime() {
  setDepartureTimeFromHours(5);
}

function getTimeWindow() {
  const arrivalDate = new Date(arrivalInput.value);
  const departureDate = new Date(departureInput.value);
  const hasArrival = !Number.isNaN(arrivalDate.getTime());
  const hasDeparture = !Number.isNaN(departureDate.getTime());
  const layoverMinutes = hasArrival && hasDeparture
    ? Math.round((departureDate.getTime() - arrivalDate.getTime()) / 60000)
    : null;

  return {
    arrivalDate,
    departureDate,
    hasArrival,
    hasDeparture,
    layoverMinutes,
  };
}

function updateLayoverWindowHint() {
  if (!layoverWindowEl) {
    return;
  }

  const { hasArrival, hasDeparture, layoverMinutes } = getTimeWindow();
  layoverWindowEl.classList.remove("warn", "good");
  if (!hasArrival || !hasDeparture) {
    layoverWindowEl.textContent = "Layover window: choose arrival and departure.";
    layoverWindowEl.classList.add("warn");
    return;
  }
  if (layoverMinutes <= 0) {
    layoverWindowEl.textContent = "Layover window: departure must be after arrival.";
    layoverWindowEl.classList.add("warn");
    return;
  }
  layoverWindowEl.textContent = `Layover window: ${layoverMinutes} min (${formatDuration(layoverMinutes)}).`;
  layoverWindowEl.classList.add("good");
}

function setPresentationMode(enabled) {
  presentationModeEnabled = enabled;
  document.body.classList.toggle("presentation-mode", presentationModeEnabled);
  if (togglePresentationBtn) {
    togglePresentationBtn.setAttribute("aria-pressed", String(presentationModeEnabled));
    togglePresentationBtn.textContent = `Presentation mode: ${presentationModeEnabled ? "On" : "Off"}`;
  }
}

function setTravelFact(message) {
  if (!travelFactEl) {
    return;
  }
  travelFactEl.textContent = message;
}

function updateTravelFact(data = null) {
  if (data?.feasibility?.riskLabel) {
    const risk = data.feasibility.riskLabel;
    if (risk === "Low") {
      setTravelFact("Low-risk plans protect return buffer while still creating meaningful off-airport time.");
      return;
    }
    if (risk === "Medium") {
      setTravelFact("Medium-risk plans can work, but every transfer minute should stay on track.");
      return;
    }
    setTravelFact("High-risk plans usually mean in-airport is the safer choice for this connection.");
    return;
  }

  const { layoverMinutes } = getTimeWindow();
  if (!Number.isFinite(layoverMinutes)) {
    setTravelFact("Add arrival and departure times to size your real layover window.");
    return;
  }
  if (layoverMinutes <= 180) {
    setTravelFact("Tighter windows under 3 hours often favor quick options near the airport.");
    return;
  }
  if (layoverMinutes <= 360) {
    setTravelFact("Mid-range layovers work best when outbound travel stays short and predictable.");
    return;
  }
  setTravelFact("Longer layovers can support richer stops if your return buffer still stays protected.");
}

function runNextStepAction() {
  const action = nextStepBtn?.dataset.action || "submit";
  if (action === "submit") {
    form.requestSubmit();
    return;
  }
  if (action === "copy") {
    copyPlanBrief().catch(() => {
      setStatus("Could not copy the plan brief.", "error");
    });
    return;
  }
  if (["decision", "timeline", "alternatives", "map"].includes(action)) {
    setActiveTab(action);
    resultsTopEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setNextStep({ text, label, action, tone = "neutral" }) {
  if (!nextStepWrapEl || !nextStepTextEl || !nextStepBtn) {
    return;
  }

  nextStepWrapEl.className = `next-step ${tone}`;
  nextStepTextEl.textContent = text;
  nextStepBtn.textContent = label;
  nextStepBtn.dataset.action = action;
}

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function setPlanActionState(enabled) {
  copyBriefBtn.disabled = !enabled;
  exportPlanBtn.disabled = !enabled;
}

function setActiveTab(tab) {
  activeTab = tab;
  for (const button of tabButtons) {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of tabPanels) {
    const isActive = panel.dataset.tabPanel === tab;
    panel.classList.toggle("active", isActive);
  }
}

function setLoadingState(isLoading) {
  document.body.classList.toggle("is-loading", isLoading);
}

function setActivePreset(hours) {
  let hasMatch = false;
  presetButtons.forEach((button) => {
    const buttonHours = Number(button.dataset.hours);
    const isActive = buttonHours === hours;
    button.classList.toggle("active", isActive);
    if (isActive) {
      hasMatch = true;
    }
  });
  if (!hasMatch) {
    presetButtons.forEach((button) => button.classList.remove("active"));
  }
}

function updatePlannerChecklist() {
  const { arrivalDate, hasArrival, hasDeparture, layoverMinutes } = getTimeWindow();
  const connectionType = form.elements.connectionType.value;
  const selectedInterests = form.querySelectorAll("input[name='interests']:checked").length;
  const minutesUntilArrival = hasArrival ? Math.round((arrivalDate.getTime() - Date.now()) / 60000) : null;

  const layoverLine = !hasArrival || !hasDeparture
    ? "Layover window not set yet."
    : layoverMinutes > 0
      ? `Estimated layover window: ${layoverMinutes} min (${formatDuration(layoverMinutes)}).`
      : "Departure must be after arrival.";

  const timingLine = !hasArrival
    ? "Arrival time is missing."
    : minutesUntilArrival > 0
      ? `Arrival starts in about ${minutesUntilArrival} min.`
      : "Arrival is now or in the past.";

  const connectionLine = connectionType === "international"
    ? "International selected: stricter processing and return assumptions apply."
    : "Domestic selected: moderate processing assumptions apply.";

  const interestLine = selectedInterests > 0
    ? `${selectedInterests} interest${selectedInterests > 1 ? "s" : ""} selected.`
    : "No interests selected; default categories will be used.";

  plannerChecklistEl.innerHTML = [layoverLine, timingLine, connectionLine, interestLine]
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  updateLayoverWindowHint();
  updateTravelFact();
}

function applyScenario(scenarioKey) {
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) {
    return;
  }

  form.elements.airportCode.value = scenario.airportCode;
  form.elements.connectionType.value = scenario.connectionType;
  setDefaultArrivalTime();
  setDepartureTimeFromHours(scenario.hoursAhead);
  setActivePreset(scenario.hoursAhead);

  const selectedInterests = new Set(scenario.interests);
  for (const checkbox of form.querySelectorAll("input[name='interests']")) {
    checkbox.checked = selectedInterests.has(checkbox.value);
  }

  updatePlannerChecklist();
  setStatus(`Loaded scenario: ${scenarioKey.replace("-", " ")}`, "info");
}

function resetResultsView() {
  resultTitle.textContent = "Awaiting input";
  riskPill.textContent = "No result";
  riskPill.className = "risk-pill neutral";
  goNoGoEl.textContent = "Awaiting recommendation";
  goNoGoEl.className = "decision-banner neutral";
  planUpdatedEl.textContent = "No plan generated yet.";
  decisionWhyEl.className = "decision-why";
  decisionWhyEl.innerHTML = "<p>Generate a plan to see why this recommendation was made.</p>";
  scoreBreakdownEl.className = "breakdown-list";
  scoreBreakdownEl.innerHTML = "<p>Generate a plan to view score components.</p>";
  narrativeEl.textContent = "";
  aiDetailsEl.className = "ai-details hidden";
  aiDetailsEl.innerHTML = "";
  requestMetaEl.textContent = "";
  setNextStep({
    text: "Generate a plan to get a recommendation.",
    label: "Generate plan",
    action: "submit",
  });

  scoreEl.textContent = "-";
  confidenceLabelEl.textContent = "-";
  confidenceFillEl.style.width = "0%";
  layoverEl.textContent = "-";
  processingEl.textContent = "-";
  bufferEl.textContent = "-";
  slackEl.textContent = "-";
  aiProviderEl.textContent = "-";

  safetyChecklistEl.className = "safety-list";
  safetyChecklistEl.innerHTML = "<p>Generate a plan to evaluate safety checks.</p>";
  selectedPoiEl.className = "poi-card empty";
  selectedPoiEl.textContent = "Generate a plan to see selected POI details.";

  scheduleEl.className = "timeline empty";
  scheduleEl.textContent = "No itinerary yet.";
  candidatesEl.className = "candidate-list empty";
  candidatesEl.textContent = "Generate a plan to compare candidate POIs.";

  lastPlanData = null;
  lastRequestPayload = null;
  lastCandidates = [];
  selectedCandidateIndex = -1;
  candidateMarkers = [];
  setPlanActionState(false);

  if (layerGroup) {
    layerGroup.clearLayers();
  }
  if (map) {
    map.setView([39.5, -98.35], 4);
  }

  setActiveTab("decision");
  updateTravelFact();
}

function initMap() {
  map = L.map("map", { zoomControl: false }).setView([39.5, -98.35], 4);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
}

function setApiStatus({
  state = "checking",
  label = "Checking backend...",
  latency = "-",
  meta = "",
} = {}) {
  apiHealthCard.className = `api-health ${state}`;
  apiStateEl.textContent = label;
  apiLatencyEl.textContent = latency;
  apiMetaEl.textContent = meta;
}

async function checkApiHealth() {
  setApiStatus({ state: "checking", label: "Checking backend...", latency: "-" });
  const startedAt = performance.now();
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();
    const latency = `${Math.round(performance.now() - startedAt)} ms`;

    if (!response.ok || data.status !== "ok") {
      throw new Error(data.error || "Health check returned non-ok status.");
    }

    setApiStatus({
      state: "online",
      label: "Backend online",
      latency,
      meta: `Server time ${formatDateTime(data.timestamp)} · v${data.version || "unknown"}`,
    });
    return true;
  } catch (error) {
    setApiStatus({
      state: "offline",
      label: "Backend unreachable",
      latency: "-",
      meta: error.message || "Could not reach API",
    });
    return false;
  }
}

function renderSchedule(schedule) {
  if (!schedule.length) {
    scheduleEl.className = "timeline empty";
    scheduleEl.textContent = "No safe off-airport itinerary for this layover window.";
    return;
  }

  scheduleEl.className = "timeline";
  scheduleEl.innerHTML = schedule
    .map((item) => {
      return `
        <article class="timeline-item">
          <div class="time-range">${escapeHtml(item.start)} to ${escapeHtml(item.end)}</div>
          <div class="timeline-main">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.location)}</span>
            ${item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ""}
          </div>
          <div class="timeline-duration">${escapeHtml(formatMinutes(item.minutes))}</div>
        </article>
      `;
    })
    .join("");
}

function renderDecisionBanner(data) {
  const risk = data.feasibility?.riskLabel;
  const feasible = Boolean(data.feasibility?.feasible);
  if (!feasible) {
    goNoGoEl.textContent = "No-Go: Stay inside the airport for this layover.";
    goNoGoEl.className = "decision-banner no-go";
    return;
  }

  if (risk === "Low") {
    goNoGoEl.textContent = "Go: A safe off-airport window is available.";
    goNoGoEl.className = "decision-banner go";
    return;
  }

  if (risk === "Medium") {
    goNoGoEl.textContent = "Caution: Feasible, but the schedule is tight.";
    goNoGoEl.className = "decision-banner caution";
    return;
  }

  goNoGoEl.textContent = "No-Go: Keep this layover in-airport.";
  goNoGoEl.className = "decision-banner no-go";
}

function renderDecisionWhy(data) {
  const selectedPoi = data.map?.selectedPoi;
  const maxTravel = data.airport?.maxTravelMinutesOneWay?.[data.request?.connectionType] ?? null;
  const outbound = selectedPoi?.outboundMinutes ?? null;
  const slack = data.feasibility?.slackMinutes ?? null;
  const score = data.feasibility?.score ?? null;

  const travelLine = outbound == null || maxTravel == null
    ? "No off-airport travel selected."
    : outbound <= maxTravel
      ? `Travel time fits target (${outbound} min vs ${maxTravel} min target).`
      : `Travel time exceeds target (${outbound} min vs ${maxTravel} min target).`;

  const items = [
    score == null ? "Score unavailable." : `Confidence score is ${score}/100.`,
    slack == null ? "Slack is unavailable." : `Return slack is ${formatMinutes(slack)}.`,
    travelLine,
  ];

  decisionWhyEl.className = "decision-why";
  decisionWhyEl.innerHTML = items
    .map((text) => `<p>${escapeHtml(text)}</p>`)
    .join("");
}

function renderScoreBreakdown(data) {
  const slack = data.feasibility?.slackMinutes ?? -1;
  const selectedPoi = data.map?.selectedPoi;
  const outbound = selectedPoi?.outboundMinutes ?? 0;
  const inbound = selectedPoi?.inboundMinutes ?? 0;
  const dwell = selectedPoi?.dwellMinutes ?? 0;
  const maxTravel = data.airport?.maxTravelMinutesOneWay?.[data.request?.connectionType] ?? 0;
  const oneWay = Math.max(outbound, inbound);

  const slackPoints = slack >= 45 ? 55 : slack >= 20 ? 40 : slack >= 0 ? 20 : 0;
  const travelPoints = oneWay <= maxTravel ? 25 : oneWay <= maxTravel + 8 ? 10 : 0;
  const dwellPoints = dwell >= 45 ? 20 : dwell >= 30 ? 10 : 0;

  const rows = [
    { label: "Time slack", points: slackPoints, max: 55 },
    { label: "Travel distance", points: travelPoints, max: 25 },
    { label: "Activity quality", points: dwellPoints, max: 20 },
  ];

  scoreBreakdownEl.className = "breakdown-list";
  scoreBreakdownEl.innerHTML = rows
    .map((row) => {
      const width = Math.round((row.points / row.max) * 100);
      return `
        <article class="breakdown-row">
          <div class="breakdown-head">
            <span>${escapeHtml(row.label)}</span>
            <strong>${row.points}/${row.max}</strong>
          </div>
          <div class="breakdown-track">
            <div class="breakdown-fill" style="width:${width}%"></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function buildSafetyChecks(data) {
  const slack = data.feasibility?.slackMinutes ?? -1;
  const score = data.feasibility?.score ?? 0;
  const returnBuffer = data.summary?.returnBufferMinutes ?? 0;
  const selectedPoi = data.map?.selectedPoi;
  const aiUsed = Boolean(data.ai?.used);

  return [
    {
      label: "Feasibility score is strong",
      passed: score >= 70,
      detail: `Current score: ${score}/100`,
    },
    {
      label: "Return slack is healthy",
      passed: slack >= 30,
      detail: `Current slack: ${formatMinutes(slack)}`,
    },
    {
      label: "Buffer is preserved",
      passed: returnBuffer >= 60,
      detail: `Return buffer: ${formatMinutes(returnBuffer)}`,
    },
    {
      label: "An off-airport stop is selected",
      passed: Boolean(selectedPoi),
      detail: selectedPoi ? `Selected: ${selectedPoi.name}` : "No selected POI",
    },
    {
      label: "Narrative source available",
      passed: aiUsed || Boolean(data.ai),
      detail: aiUsed ? "AI generated guidance." : "Fallback deterministic guidance.",
    },
  ];
}

function renderSafetyChecklist(data) {
  const checks = buildSafetyChecks(data);
  safetyChecklistEl.className = "safety-list";
  safetyChecklistEl.innerHTML = checks
    .map((check) => {
      const stateClass = check.passed ? "pass" : "warn";
      return `
        <article class="safety-item ${stateClass}">
          <p><strong>${escapeHtml(check.label)}</strong></p>
          <p>${escapeHtml(check.detail)}</p>
        </article>
      `;
    })
    .join("");
}

function renderAiDetails(ai) {
  const provider = ai?.provider || "fallback";
  const model = ai?.model ? ` (${ai.model})` : "";
  const tips = Array.isArray(ai?.travelerTips) ? ai.travelerTips : [];
  const sourceLine = ai?.used
    ? `Guidance generated by ${provider}${model}.`
    : "Guidance is currently using deterministic fallback wording.";
  const errorLine = ai?.error ? `AI note: ${ai.error}` : null;

  if (!tips.length && !errorLine) {
    aiDetailsEl.className = "ai-details";
    aiDetailsEl.innerHTML = `<div class="tips-title">${escapeHtml(sourceLine)}</div>`;
    return;
  }

  aiDetailsEl.className = "ai-details";
  aiDetailsEl.innerHTML = `
    <div class="tips-title">${escapeHtml(sourceLine)}</div>
    ${tips.length ? `<ul>${tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>` : ""}
    ${errorLine ? `<p class="ai-note">${escapeHtml(errorLine)}</p>` : ""}
  `;
}

function renderCandidates(candidates) {
  lastCandidates = candidates;

  if (!candidates.length) {
    candidatesEl.className = "candidate-list empty";
    candidatesEl.textContent = "No nearby candidates found for this request.";
    selectedCandidateIndex = -1;
    return;
  }

  if (selectedCandidateIndex >= candidates.length) {
    selectedCandidateIndex = -1;
  }

  candidatesEl.className = "candidate-list";
  candidatesEl.innerHTML = candidates
    .map((candidate, index) => {
      const riskClass = candidate.riskLabel ? candidate.riskLabel.toLowerCase() : "neutral";
      return `
        <button type="button" class="candidate-item ${selectedCandidateIndex === index ? "active" : ""}" data-index="${index}">
          <div>
            <p class="candidate-title">${index + 1}. ${escapeHtml(candidate.name)}</p>
            <p class="candidate-meta">${escapeHtml(candidate.category || "poi")}</p>
          </div>
          <div class="candidate-score">
            <span>${escapeHtml(String(candidate.score ?? "-"))}/100</span>
            <span class="risk-chip ${riskClass}">${escapeHtml(candidate.riskLabel || "Unknown")}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderSelectedPoi(selectedPoi) {
  if (!selectedPoi) {
    selectedPoiEl.className = "poi-card empty";
    selectedPoiEl.textContent = "No off-airport stop selected for this layover.";
    return;
  }

  selectedPoiEl.className = "poi-card";
  selectedPoiEl.innerHTML = `
    <div class="poi-head">
      <h3>${escapeHtml(selectedPoi.name)}</h3>
      <span class="poi-tag">${escapeHtml(selectedPoi.category || "poi")}</span>
    </div>
    <div class="poi-meta-grid">
      <div>
        <span>Outbound</span>
        <strong>${escapeHtml(formatMinutes(selectedPoi.outboundMinutes))}</strong>
      </div>
      <div>
        <span>Inbound</span>
        <strong>${escapeHtml(formatMinutes(selectedPoi.inboundMinutes))}</strong>
      </div>
      <div>
        <span>Dwell</span>
        <strong>${escapeHtml(formatMinutes(selectedPoi.dwellMinutes))}</strong>
      </div>
    </div>
    <p class="poi-address">${escapeHtml(selectedPoi.address || "Address unavailable from source data.")}</p>
  `;
}

function renderMap(mapData) {
  layerGroup.clearLayers();
  candidateMarkers = [];

  if (!mapData?.airport) {
    return;
  }

  const points = [];
  const airportMarker = L.marker([mapData.airport.lat, mapData.airport.lon]).bindPopup(
    `<strong>${escapeHtml(mapData.airport.name)}</strong><br />Airport`
  );
  airportMarker.addTo(layerGroup);
  points.push([mapData.airport.lat, mapData.airport.lon]);

  (mapData.candidates || []).forEach((candidate) => {
    const marker = L.circleMarker([candidate.lat, candidate.lon], {
      radius: 7,
      color:
        candidate.riskLabel === "Low"
          ? "#166534"
          : candidate.riskLabel === "Medium"
            ? "#a16207"
            : "#b91c1c",
      fillOpacity: 0.82,
    }).bindPopup(
      `<strong>${escapeHtml(candidate.name)}</strong><br />${escapeHtml(candidate.category || "poi")}<br />Score: ${escapeHtml(candidate.score ?? "-")}`
    );
    marker.addTo(layerGroup);
    candidateMarkers.push(marker);
    points.push([candidate.lat, candidate.lon]);
  });

  if (mapData.selectedPoi) {
    const line = L.polyline(
      [
        [mapData.airport.lat, mapData.airport.lon],
        [mapData.selectedPoi.lat, mapData.selectedPoi.lon],
      ],
      {
        color: "#146b61",
        weight: 4,
        dashArray: "10 7",
      }
    );
    line.addTo(layerGroup);
  }

  if (points.length > 1) {
    map.fitBounds(points, { padding: [30, 30] });
  } else {
    map.setView(points[0], 11);
  }
}

function focusCandidate(index) {
  const marker = candidateMarkers[index];
  const candidate = lastCandidates[index];
  if (!marker || !candidate) {
    return;
  }
  selectedCandidateIndex = index;
  renderCandidates(lastCandidates);
  const latLng = marker.getLatLng();
  map.setView(latLng, Math.max(map.getZoom(), 12), { animate: true });
  marker.openPopup();
}

function buildPlanBrief(data) {
  const arrivalValue = lastRequestPayload?.arrivalTime || data.request?.arrivalTime;
  const recommendation = data.map?.selectedPoi
    ? `${data.map.selectedPoi.name} (${data.map.selectedPoi.category || "poi"})`
    : `Stay at ${data.airport.code}`;
  const lines = [
    "LayoverPlus Plan Brief",
    `Airport: ${data.request.airportCode}`,
    `Connection: ${data.request.connectionType}`,
  ];
  if (arrivalValue) {
    lines.push(`Arrival: ${formatDateTime(arrivalValue)}`);
  }
  lines.push(
    `Departure: ${formatDateTime(data.request.departureTime)}`,
    `Risk: ${data.feasibility.riskLabel}`,
    `Score: ${data.feasibility.score}/100`,
    `Slack: ${formatMinutes(data.feasibility.slackMinutes)}`,
    `Recommendation: ${recommendation}`,
    `Narrative: ${data.narrative}`
  );
  return lines.join("\n");
}

async function copyPlanBrief() {
  if (!lastPlanData) {
    setStatus("Generate a plan before copying a brief.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(buildPlanBrief(lastPlanData));
    setStatus("Plan brief copied to clipboard.", "success");
  } catch (_error) {
    setStatus("Clipboard write failed. Copy manually from the summary card.", "error");
  }
}

function exportPlanJson() {
  if (!lastPlanData) {
    setStatus("Generate a plan before exporting.", "error");
    return;
  }

  const blob = new Blob([JSON.stringify(lastPlanData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  link.href = url;
  link.download = `layoverplus-plan-${lastPlanData.request.airportCode}-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Plan JSON exported.", "success");
}

function setNextStepFromPlan(data) {
  const risk = data.feasibility?.riskLabel || "Unknown";
  if (risk === "Low") {
    setNextStep({
      text: "Route looks healthy. Confirm the map path and then copy your brief.",
      label: "Open map",
      action: "map",
      tone: "good",
    });
    return;
  }
  if (risk === "Medium") {
    setNextStep({
      text: "This is feasible but tight. Review timeline transitions before committing.",
      label: "Review timeline",
      action: "timeline",
      tone: "warn",
    });
    return;
  }
  setNextStep({
    text: "Risk is high. Compare alternatives or keep this layover inside the airport.",
    label: "View alternatives",
    action: "alternatives",
    tone: "danger",
  });
}

function updateSummary(data, payload = null) {
  lastPlanData = data;
  if (payload) {
    lastRequestPayload = payload;
  }
  setPlanActionState(true);
  renderDecisionBanner(data);
  renderDecisionWhy(data);
  renderScoreBreakdown(data);
  setNextStepFromPlan(data);
  updateTravelFact(data);
  const aiTitle = data.ai?.title && data.ai.title.trim();
  resultTitle.textContent = aiTitle || (data.map.selectedPoi ? data.map.selectedPoi.name : `Stay at ${data.airport.code}`);
  riskPill.textContent = `${data.feasibility.riskLabel} Risk`;
  riskPill.className = `risk-pill ${data.feasibility.riskLabel.toLowerCase()}`;

  scoreEl.textContent = `${data.feasibility.score}/100`;
  confidenceLabelEl.textContent = `${data.feasibility.score}/100`;
  confidenceFillEl.style.width = `${Math.max(0, Math.min(100, data.feasibility.score))}%`;
  layoverEl.textContent = formatMinutes(data.summary.layoverMinutes);
  processingEl.textContent = formatMinutes(data.summary.processingMinutes);
  bufferEl.textContent = formatMinutes(data.summary.returnBufferMinutes);
  slackEl.textContent = formatMinutes(data.feasibility.slackMinutes);
  aiProviderEl.textContent = data.ai?.used
    ? `${data.ai.provider}${data.ai.model ? ` · ${data.ai.model}` : ""}`
    : "Fallback";

  planUpdatedEl.textContent = `Updated ${formatDateTime(new Date())}`;
  narrativeEl.textContent = data.narrative;
  renderAiDetails(data.ai || {});
  const requestSegments = [
    `Request: ${data.request.airportCode}`,
    data.request.connectionType,
  ];
  const arrivalValue = lastRequestPayload?.arrivalTime || data.request?.arrivalTime;
  if (arrivalValue) {
    requestSegments.push(`Arrival ${formatDateTime(arrivalValue)}`);
  }
  requestSegments.push(`Departure ${formatDateTime(data.request.departureTime)}`);
  requestMetaEl.textContent = requestSegments.join(" · ");

  renderSafetyChecklist(data);
  renderSchedule(data.schedule || []);
  renderSelectedPoi(data.map?.selectedPoi || null);
  renderCandidates(data.map?.candidates || []);
  renderMap(data.map);

  selectedCandidateIndex = data.map?.candidates?.length ? 0 : -1;
  if (selectedCandidateIndex === 0) {
    renderCandidates(data.map.candidates);
  }
  setActiveTab("decision");
}

async function loadConfig() {
  const response = await fetch("/api/config", { cache: "no-store" });
  const config = await response.json();
  if (!response.ok) {
    throw new Error(config.error || "Failed to load API config.");
  }

  airportSelect.innerHTML = config.airports
    .map((airport) => `<option value="${airport.code}">${airport.code} · ${airport.name}</option>`)
    .join("");

  interestsContainer.innerHTML = Object.entries(config.interests)
    .map(([key, value], index) => {
      return `
        <label class="chip">
          <input type="checkbox" name="interests" value="${key}" ${index < 2 ? "checked" : ""} />
          <span>${value.label}</span>
        </label>
      `;
    })
    .join("");
}

function getPayloadFromForm() {
  const formData = new FormData(form);
  const arrivalValue = formData.get("arrivalTime");
  const departureValue = formData.get("departureTime");
  const arrivalDate = new Date(arrivalValue);
  const departureDate = new Date(departureValue);

  if (!arrivalValue || Number.isNaN(arrivalDate.getTime())) {
    throw new Error("Choose a valid arrival time.");
  }
  if (!departureValue || Number.isNaN(departureDate.getTime())) {
    throw new Error("Choose a valid departure time.");
  }
  if (departureDate.getTime() <= arrivalDate.getTime()) {
    throw new Error("Departure must be after arrival.");
  }
  if (departureDate.getTime() <= Date.now()) {
    throw new Error("Departure time must be in the future.");
  }

  return {
    airportCode: formData.get("airportCode"),
    arrivalTime: arrivalValue,
    departureTime: departureValue,
    connectionType: formData.get("connectionType"),
    interests: formData.getAll("interests"),
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Building plan...", "info");
  submitButton.disabled = true;
  setLoadingState(true);

  try {
    const payload = getPayloadFromForm();
    lastRequestPayload = payload;
    const apiOnline = await checkApiHealth();
    if (!apiOnline) {
      throw new Error("API is unavailable. Restart the server and retry.");
    }

    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unknown error");
    }

    updateSummary(data, payload);
    resultsTopEl.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus("Plan generated.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    submitButton.disabled = false;
    setLoadingState(false);
  }
});

resetPlannerBtn.addEventListener("click", () => {
  setDefaultArrivalTime();
  setDefaultDepartureTime();
  setActivePreset(5);
  form.elements.connectionType.value = "domestic";
  const interests = Array.from(form.querySelectorAll("input[name='interests']"));
  interests.forEach((checkbox, index) => {
    checkbox.checked = index < 2;
  });
  updatePlannerChecklist();
  resetResultsView();
  setStatus("Planner reset.", "info");
});

copyBriefBtn.addEventListener("click", () => {
  copyPlanBrief().catch(() => {
    setStatus("Could not copy the plan brief.", "error");
  });
});

exportPlanBtn.addEventListener("click", () => {
  exportPlanJson();
});

if (togglePresentationBtn) {
  togglePresentationBtn.addEventListener("click", () => {
    setPresentationMode(!presentationModeEnabled);
  });
}

if (nextStepBtn) {
  nextStepBtn.addEventListener("click", () => {
    runNextStepAction();
  });
}

candidatesEl.addEventListener("click", (event) => {
  const candidateButton = event.target.closest(".candidate-item");
  if (!candidateButton || !candidateButton.dataset.index) {
    return;
  }
  const index = Number(candidateButton.dataset.index);
  if (!Number.isFinite(index)) {
    return;
  }
  focusCandidate(index);
});

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    if (!tab) {
      return;
    }
    setActiveTab(tab);
  });
  button.addEventListener("keydown", (event) => {
    if (!["ArrowRight", "ArrowLeft"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const currentIndex = tabButtons.indexOf(button);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + offset + tabButtons.length) % tabButtons.length;
    const nextButton = tabButtons[nextIndex];
    nextButton.focus();
    const tab = nextButton.dataset.tab;
    if (tab) {
      setActiveTab(tab);
    }
  });
}

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    const hours = Number(button.dataset.hours);
    if (!Number.isFinite(hours)) {
      return;
    }
    setDepartureTimeFromHours(hours);
    setActivePreset(hours);
    updatePlannerChecklist();
  });
}

for (const button of scenarioButtons) {
  button.addEventListener("click", () => {
    const scenarioKey = button.dataset.scenario;
    if (!scenarioKey) {
      return;
    }
    applyScenario(scenarioKey);
  });
}

form.addEventListener("change", () => {
  updatePlannerChecklist();
});

form.addEventListener("input", () => {
  updatePlannerChecklist();
});

setDefaultArrivalTime();
setDefaultDepartureTime();
setActivePreset(5);
updatePlannerChecklist();
initMap();
setActiveTab(activeTab);
setPresentationMode(false);
resetResultsView();
Promise.all([checkApiHealth(), loadConfig()]).catch((error) => {
  setStatus(`Failed to load configuration: ${error.message}`, "error");
});

setInterval(() => {
  checkApiHealth().catch(() => {});
}, 60000);
