const airportSelect = document.getElementById("airportCode");
const interestsContainer = document.getElementById("interests");
const form = document.getElementById("planner-form");
const statusEl = document.getElementById("status");
const buildProgressEl = document.getElementById("build-progress");
const submitButton = form.querySelector("button[type='submit']");
const resetPlannerBtn = document.getElementById("reset-planner");
const resultsTopEl = document.getElementById("results-top");
const airlineCodeInput = document.getElementById("airlineCode");
const flightNumberInput = document.getElementById("flightNumber");
const ticketFlightAwareLink = document.getElementById("ticket-flightaware");
const ticketGoogleFlightsLink = document.getElementById("ticket-googleflights");

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
const allocationBarEl = document.getElementById("allocation-bar");
const allocationLegendEl = document.getElementById("allocation-legend");
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
const travelFactEl = document.getElementById("travel-fact");
const nextStepWrapEl = document.getElementById("next-step");
const nextStepTextEl = document.getElementById("next-step-text");
const nextStepBtn = document.getElementById("next-step-btn");
const presetButtons = Array.from(document.querySelectorAll(".preset-btn"));
const scenarioButtons = Array.from(document.querySelectorAll(".scenario-btn"));
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const tabDecisionEl = document.getElementById("tab-decision");
const tabTimelineEl = document.getElementById("tab-timeline");
const tabAlternativesEl = document.getElementById("tab-alternatives");
const tabMapEl = document.getElementById("tab-map");
const riskProfileSelect = document.getElementById("riskProfile");
const packButtons = Array.from(document.querySelectorAll(".pack-btn"));
const autoReplanInput = document.getElementById("autoReplan");
const trustAcknowledgedInput = document.getElementById("trustAcknowledged");
const openAirportMapBtn = document.getElementById("open-airport-map");
const openRideLinkBtn = document.getElementById("open-ride-link");
const toggleShareCardBtn = document.getElementById("toggle-share-card");
const shareCardEl = document.getElementById("share-card");
const sharePreviewEl = document.getElementById("share-preview");
const flightBadgeEl = document.getElementById("flight-badge");
const flightStatusLineEl = document.getElementById("flight-status-line");
const flightAirlineEl = document.getElementById("flight-airline");
const flightGateEl = document.getElementById("flight-gate");
const flightDelayEl = document.getElementById("flight-delay");
const flightEtaEl = document.getElementById("flight-eta");
const flightUpdatedEl = document.getElementById("flight-updated");
const flightEventsEl = document.getElementById("flight-events");
const replanHistoryEl = document.getElementById("replan-history");
const feedbackButtons = Array.from(document.querySelectorAll(".feedback-btn"));
const feedbackCommentInput = document.getElementById("feedback-comment");
const feedbackSubmitBtn = document.getElementById("submit-feedback");
const feedbackStatusEl = document.getElementById("feedback-status");

let map;
let layerGroup;
let candidateMarkers = [];
let lastCandidates = [];
let selectedCandidateIndex = -1;
let lastPlanData = null;
let lastRequestPayload = null;
let activeTab = "decision";
let buildProgressTimer = null;
let selectedStrategyPack = "standard";
let sessionKey = null;
let flightPollTimer = null;
let replanInFlight = false;
let lastAutoReplanSignature = null;
let selectedFeedbackScore = null;
let lastFlightSnapshot = null;

const BUILD_PROGRESS_MESSAGES = [
  "Checking backend availability...",
  "Calculating safe layover windows...",
  "Evaluating nearby options and routing...",
  "Scoring risk and preparing recommendation...",
];
const FLIGHT_POLL_INTERVAL_MS = 45000;

const SCENARIOS = {
  "food-sfo": {
    airportCode: "SFO",
    connectionType: "domestic",
    hoursAhead: 5,
    riskProfile: "balanced",
    strategyPack: "food-first",
    interests: ["food", "shopping"],
  },
  "culture-jfk": {
    airportCode: "JFK",
    connectionType: "domestic",
    hoursAhead: 6,
    riskProfile: "balanced",
    strategyPack: "culture-deep",
    interests: ["culture", "sightseeing"],
  },
  "scenic-lax": {
    airportCode: "LAX",
    connectionType: "international",
    hoursAhead: 8,
    riskProfile: "conservative",
    strategyPack: "standard",
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

function setBuildProgressMessage(message) {
  if (!buildProgressEl) {
    return;
  }
  buildProgressEl.textContent = message;
}

function stopBuildProgressTicker() {
  if (buildProgressTimer) {
    clearInterval(buildProgressTimer);
    buildProgressTimer = null;
  }
}

function startBuildProgressTicker() {
  stopBuildProgressTicker();
  let index = 0;
  setBuildProgressMessage(BUILD_PROGRESS_MESSAGES[index]);
  buildProgressTimer = setInterval(() => {
    index = (index + 1) % BUILD_PROGRESS_MESSAGES.length;
    setBuildProgressMessage(BUILD_PROGRESS_MESSAGES[index]);
  }, 1400);
}

function normalizeAirlineCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
}

function normalizeFlightNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function getFlightContext() {
  return {
    airlineCode: normalizeAirlineCode(airlineCodeInput?.value),
    flightNumber: normalizeFlightNumber(flightNumberInput?.value),
  };
}

function updateTicketLinks() {
  if (!ticketFlightAwareLink || !ticketGoogleFlightsLink) {
    return;
  }

  const { airlineCode, flightNumber } = getFlightContext();
  const combined = `${airlineCode}${flightNumber}`.trim();

  if (!combined) {
    ticketFlightAwareLink.href = "#";
    ticketGoogleFlightsLink.href = "#";
    ticketFlightAwareLink.classList.add("disabled");
    ticketGoogleFlightsLink.classList.add("disabled");
    return;
  }

  const encoded = encodeURIComponent(combined);
  ticketFlightAwareLink.href = `https://www.flightaware.com/live/flight/${encoded}`;
  ticketGoogleFlightsLink.href = `https://www.google.com/travel/flights?q=${encoded}`;
  ticketFlightAwareLink.classList.remove("disabled");
  ticketGoogleFlightsLink.classList.remove("disabled");
}

async function checkApiHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.status === "ok";
  } catch (_error) {
    return false;
  }
}

async function sendEvent(eventType, stage, details = {}) {
  try {
    await fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        stage,
        sessionKey,
        details,
      }),
    });
  } catch (_error) {
    // Analytics events are best-effort only.
  }
}

function normalizeRiskProfile(value) {
  return ["conservative", "balanced", "explorer"].includes(value) ? value : "balanced";
}

function normalizeStrategyPack(value) {
  return ["standard", "food-first", "culture-deep", "recharge"].includes(value) ? value : "standard";
}

function getStrategyPackLabel(pack) {
  const labels = {
    standard: "Standard",
    "food-first": "Food First",
    "culture-deep": "Culture Deep Dive",
    recharge: "Recharge Nearby",
  };
  return labels[pack] || "Standard";
}

function setStrategyPack(pack, { emitEvent = true } = {}) {
  const normalized = normalizeStrategyPack(pack);
  selectedStrategyPack = normalized;
  packButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.pack === normalized);
  });
  if (emitEvent) {
    sendEvent("strategy_pack_selected", "planner", { strategyPack: normalized });
  }
}

function setTabLabels({ timelineCount = 0, alternativesCount = 0 } = {}) {
  if (tabDecisionEl) {
    tabDecisionEl.textContent = "Decision";
  }
  if (tabTimelineEl) {
    tabTimelineEl.textContent = timelineCount > 0 ? `Timeline (${timelineCount})` : "Timeline";
  }
  if (tabAlternativesEl) {
    tabAlternativesEl.textContent =
      alternativesCount > 0 ? `Alternatives (${alternativesCount})` : "Alternatives";
  }
  if (tabMapEl) {
    tabMapEl.textContent = "Map";
  }
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
  const riskProfile = normalizeRiskProfile(form.elements.riskProfile?.value);
  const selectedInterests = form.querySelectorAll("input[name='interests']:checked").length;
  const minutesUntilArrival = hasArrival ? Math.round((arrivalDate.getTime() - Date.now()) / 60000) : null;
  const trustReady = Boolean(trustAcknowledgedInput?.checked);

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

  const profileLine = `Risk profile: ${riskProfile}. Strategy pack: ${getStrategyPackLabel(selectedStrategyPack)}.`;

  const interestLine = selectedInterests > 0
    ? `${selectedInterests} interest${selectedInterests > 1 ? "s" : ""} selected.`
    : "No interests selected; default categories will be used.";

  const trustLine = trustReady
    ? "Guidance acknowledgment complete."
    : "Check guidance acknowledgment before generating a plan.";

  plannerChecklistEl.innerHTML = [layoverLine, timingLine, connectionLine, profileLine, interestLine, trustLine]
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
  if (form.elements.riskProfile) {
    form.elements.riskProfile.value = normalizeRiskProfile(scenario.riskProfile);
  }
  setStrategyPack(scenario.strategyPack || "standard", { emitEvent: false });
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
  if (allocationBarEl && allocationLegendEl) {
    allocationBarEl.className = "allocation-bar empty";
    allocationBarEl.innerHTML = '<span class="allocation-empty">Generate a plan to view time distribution.</span>';
    allocationLegendEl.className = "allocation-legend empty";
    allocationLegendEl.innerHTML = "";
  }
  setBuildProgressMessage("");
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
  if (shareCardEl && sharePreviewEl) {
    shareCardEl.classList.add("hidden");
    sharePreviewEl.textContent = "Generate a plan to build a share summary.";
  }
  if (toggleShareCardBtn) {
    toggleShareCardBtn.textContent = "Show share card";
  }
  if (openAirportMapBtn) {
    openAirportMapBtn.disabled = true;
    openAirportMapBtn.dataset.href = "";
  }
  if (openRideLinkBtn) {
    openRideLinkBtn.disabled = true;
    openRideLinkBtn.dataset.href = "";
  }
  if (flightBadgeEl) {
    flightBadgeEl.textContent = "No context";
    flightBadgeEl.className = "risk-pill neutral";
  }
  if (flightStatusLineEl) {
    flightStatusLineEl.textContent = "Add flight code + number to enable status signals.";
  }
  if (flightAirlineEl) {
    flightAirlineEl.textContent = "-";
  }
  if (flightGateEl) {
    flightGateEl.textContent = "-";
  }
  if (flightDelayEl) {
    flightDelayEl.textContent = "-";
  }
  if (flightEtaEl) {
    flightEtaEl.textContent = "-";
  }
  if (flightUpdatedEl) {
    flightUpdatedEl.textContent = "No flight status pulled yet.";
  }
  if (flightEventsEl) {
    flightEventsEl.className = "event-list empty";
    flightEventsEl.textContent = "No active flight alerts.";
  }
  if (replanHistoryEl) {
    replanHistoryEl.className = "history-list empty";
    replanHistoryEl.textContent = "No replan events yet.";
  }
  if (feedbackStatusEl) {
    feedbackStatusEl.textContent = "No feedback sent yet.";
    feedbackStatusEl.classList.remove("warn", "good");
  }
  selectedFeedbackScore = null;
  feedbackButtons.forEach((button) => {
    button.classList.remove("active");
  });

  lastPlanData = null;
  lastRequestPayload = null;
  lastCandidates = [];
  selectedCandidateIndex = -1;
  candidateMarkers = [];
  sessionKey = null;
  lastFlightSnapshot = null;
  if (flightPollTimer) {
    clearInterval(flightPollTimer);
    flightPollTimer = null;
  }
  replanInFlight = false;

  if (layerGroup) {
    layerGroup.clearLayers();
  }
  if (map) {
    map.setView([39.5, -98.35], 4);
  }

  setActiveTab("decision");
  setTabLabels();
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
  const maxTravel = data.summary?.maxTravelMinutesOneWay
    ?? data.airport?.maxTravelMinutesOneWay?.[data.request?.connectionType]
    ?? null;
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
    data.explainability?.riskProfile?.label
      ? `Risk profile: ${data.explainability.riskProfile.label}.`
      : "Risk profile unavailable.",
    data.explainability?.strategyPack?.label
      ? `Strategy pack: ${data.explainability.strategyPack.label}.`
      : "Strategy pack unavailable.",
  ];

  decisionWhyEl.className = "decision-why";
  decisionWhyEl.innerHTML = items
    .map((text) => `<p>${escapeHtml(text)}</p>`)
    .join("");
}

function renderScoreBreakdown(data) {
  const backendScore = data.explainability?.scoreComponents;
  const slack = data.feasibility?.slackMinutes ?? -1;
  const selectedPoi = data.map?.selectedPoi;
  const outbound = selectedPoi?.outboundMinutes ?? 0;
  const inbound = selectedPoi?.inboundMinutes ?? 0;
  const dwell = selectedPoi?.dwellMinutes ?? 0;
  const maxTravel = data.summary?.maxTravelMinutesOneWay
    ?? data.airport?.maxTravelMinutesOneWay?.[data.request?.connectionType]
    ?? 0;
  const oneWay = Math.max(outbound, inbound);

  const slackPoints = backendScore?.slack?.points
    ?? (slack >= 45 ? 55 : slack >= 20 ? 40 : slack >= 0 ? 20 : 0);
  const travelPoints = backendScore?.travel?.points
    ?? (oneWay <= maxTravel ? 25 : oneWay <= maxTravel + 8 ? 10 : 0);
  const dwellPoints = backendScore?.activity?.points
    ?? (dwell >= 45 ? 20 : dwell >= 30 ? 10 : 0);

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

function renderAllocation(data) {
  if (!allocationBarEl || !allocationLegendEl) {
    return;
  }
  const layoverMinutes = data.summary?.layoverMinutes ?? 0;
  if (!Number.isFinite(layoverMinutes) || layoverMinutes <= 0) {
    allocationBarEl.className = "allocation-bar empty";
    allocationBarEl.innerHTML = '<span class="allocation-empty">Layover window unavailable.</span>';
    allocationLegendEl.className = "allocation-legend empty";
    allocationLegendEl.innerHTML = "";
    return;
  }

  const selectedPoi = data.map?.selectedPoi || {};
  const processing = Math.max(0, data.summary?.processingMinutes ?? 0);
  const travel = Math.max(0, (selectedPoi.outboundMinutes ?? 0) + (selectedPoi.inboundMinutes ?? 0));
  const activity = Math.max(0, selectedPoi.dwellMinutes ?? 0);
  const buffer = Math.max(0, data.summary?.returnBufferMinutes ?? 0);
  const slack = Math.max(0, data.feasibility?.slackMinutes ?? 0);
  const used = processing + travel + activity + buffer + slack;
  const remaining = Math.max(0, layoverMinutes - used);

  const segments = [
    { label: "Processing", key: "processing", minutes: processing },
    { label: "Travel", key: "travel", minutes: travel },
    { label: "Activity", key: "activity", minutes: activity },
    { label: "Buffer", key: "buffer", minutes: buffer },
    { label: "Slack", key: "slack", minutes: slack },
    { label: "Unallocated", key: "other", minutes: remaining },
  ].filter((segment) => segment.minutes > 0);

  if (!segments.length) {
    allocationBarEl.className = "allocation-bar empty";
    allocationBarEl.innerHTML = '<span class="allocation-empty">No allocatable time segments available.</span>';
    allocationLegendEl.className = "allocation-legend empty";
    allocationLegendEl.innerHTML = "";
    return;
  }

  allocationBarEl.className = "allocation-bar";
  allocationBarEl.innerHTML = segments
    .map((segment) => {
      const width = ((segment.minutes / layoverMinutes) * 100).toFixed(2);
      return `<span class="allocation-segment ${segment.key}" style="flex:0 0 ${width}%" title="${escapeHtml(
        `${segment.label}: ${segment.minutes} min`
      )}"></span>`;
    })
    .join("");

  allocationLegendEl.className = "allocation-legend";
  allocationLegendEl.innerHTML = segments
    .map((segment) => {
      const percent = Math.round((segment.minutes / layoverMinutes) * 100);
      return `
        <p>
          <i class="allocation-dot ${segment.key}" aria-hidden="true"></i>
          <strong>${escapeHtml(segment.label)}</strong>
          <span>${escapeHtml(`${segment.minutes} min (${percent}%)`)}</span>
        </p>
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

function setNextStepFromPlan(data) {
  const risk = data.feasibility?.riskLabel || "Unknown";
  if (risk === "Low") {
    setNextStep({
      text: "Route looks healthy. Confirm your path on the map before leaving the airport.",
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

function getFlightPayloadFromState() {
  if (!lastRequestPayload && !lastPlanData) {
    return null;
  }
  const request = lastRequestPayload || lastPlanData.request || {};
  return {
    airportCode: request.airportCode,
    arrivalTime: request.arrivalTime,
    departureTime: request.departureTime,
    connectionType: request.connectionType,
    airlineCode: request.airlineCode,
    flightNumber: request.flightNumber,
    sessionKey,
  };
}

function renderSharePreview(data) {
  if (!sharePreviewEl) {
    return;
  }
  const stopName = data.map?.selectedPoi?.name
    ? data.map.selectedPoi.name
    : `${data.airport.code} terminal`;
  const risk = data.feasibility?.riskLabel || "Unknown";
  const score = data.feasibility?.score ?? "-";
  const slack = data.feasibility?.slackMinutes ?? 0;
  const profile = data.request?.riskProfile || "balanced";
  const strategy = data.request?.strategyPack || "standard";
  sharePreviewEl.textContent = [
    `LayoverPlus plan: ${risk}-risk recommendation at ${data.request?.airportCode}.`,
    `Stop: ${stopName}.`,
    `Score ${score}/100 with ${slack} min slack.`,
    `Profile ${profile}, strategy ${strategy}.`,
  ].join(" ");
}

function updateActionCenter(data) {
  if (!openAirportMapBtn || !openRideLinkBtn) {
    return;
  }

  const airportName = data.airport?.name || data.request?.airportCode || "airport";
  const airportLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(airportName)}`;
  openAirportMapBtn.dataset.href = airportLink;
  openAirportMapBtn.disabled = false;

  const selectedPoi = data.map?.selectedPoi;
  if (!selectedPoi) {
    openRideLinkBtn.disabled = true;
    openRideLinkBtn.dataset.href = "";
    return;
  }

  const destinationLabel = `${selectedPoi.name} ${selectedPoi.address || ""}`.trim();
  const rideLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationLabel)}`;
  openRideLinkBtn.disabled = false;
  openRideLinkBtn.dataset.href = rideLink;
}

function renderReplanHistory(entries = []) {
  if (!replanHistoryEl) {
    return;
  }
  if (!entries.length) {
    replanHistoryEl.className = "history-list empty";
    replanHistoryEl.textContent = "No replan events yet.";
    return;
  }
  replanHistoryEl.className = "history-list";
  replanHistoryEl.innerHTML = entries
    .map((entry) => {
      const severity = entry.delayMinutes >= 20 || entry.trigger === "boarding_soon" ? "high" : "medium";
      return `
        <article class="history-item ${severity}">
          <div class="history-head">
            <strong>${escapeHtml(entry.trigger || "trigger")}</strong>
            <span class="history-time">${escapeHtml(formatDateTime(entry.at))}</span>
          </div>
          <p>${escapeHtml(entry.reason || "Replan signal captured.")}</p>
          <p>${escapeHtml(
            `Status ${entry.statusLabel || "-"} · Gate ${entry.gate || "-"} · Delay ${entry.delayMinutes ?? 0} min`
          )}</p>
        </article>
      `;
    })
    .join("");
}

function renderFlightStatus(flight) {
  if (!flightBadgeEl || !flightStatusLineEl) {
    return;
  }
  if (!flight || !flight.usedTicketContext) {
    flightBadgeEl.textContent = "No context";
    flightBadgeEl.className = "risk-pill neutral";
    flightStatusLineEl.textContent = "Add flight code + number to enable status signals.";
    flightAirlineEl.textContent = "-";
    flightGateEl.textContent = "-";
    flightDelayEl.textContent = "-";
    flightEtaEl.textContent = "-";
    flightUpdatedEl.textContent = "No flight status pulled yet.";
    flightEventsEl.className = "event-list empty";
    flightEventsEl.textContent = "No active flight alerts.";
    return;
  }

  const statusToTone = {
    "on-time": "low",
    delayed: "medium",
    "final-call": "high",
    boarding: "high",
    departed: "high",
  };
  const tone = statusToTone[flight.statusCode] || "neutral";
  flightBadgeEl.textContent = flight.statusLabel || "Unknown";
  flightBadgeEl.className = `risk-pill ${tone}`;
  flightStatusLineEl.textContent = `${flight.airlineCode}${flight.flightNumber} · ${flight.statusLabel}`;
  flightAirlineEl.textContent = flight.airlineName || flight.airlineCode || "-";
  flightGateEl.textContent = flight.gate || "-";
  flightDelayEl.textContent = `${flight.delayMinutes || 0} min`;
  flightEtaEl.textContent = Number.isFinite(flight.minutesToDeparture)
    ? `${flight.minutesToDeparture} min`
    : "-";
  flightUpdatedEl.textContent = `Updated ${formatDateTime(flight.updatedAt)}`;

  if (!Array.isArray(flight.events) || !flight.events.length) {
    flightEventsEl.className = "event-list empty";
    flightEventsEl.textContent = "No active flight alerts.";
    return;
  }

  flightEventsEl.className = "event-list";
  flightEventsEl.innerHTML = flight.events
    .map((event) => {
      const severity = event.severity || "medium";
      return `
        <article class="event-item ${severity}">
          <div class="event-head">
            <strong>${escapeHtml(event.type || "event")}</strong>
            <span class="event-time">${escapeHtml(formatDateTime(flight.updatedAt))}</span>
          </div>
          <p>${escapeHtml(event.message || "No event details.")}</p>
        </article>
      `;
    })
    .join("");
}

async function maybeAutoReplan(flight) {
  if (!autoReplanInput?.checked || !flight?.replan?.recommended || replanInFlight) {
    return;
  }
  const signature = [
    flight.replan.trigger,
    flight.replan.suggestedDepartureTime,
    flight.gate || "-",
    flight.delayMinutes || 0,
  ].join("|");
  if (signature === lastAutoReplanSignature) {
    return;
  }
  lastAutoReplanSignature = signature;

  const suggested = new Date(flight.replan.suggestedDepartureTime);
  if (!Number.isNaN(suggested.getTime()) && suggested.getTime() > Date.now()) {
    departureInput.value = toDatetimeLocalValue(suggested);
    updatePlannerChecklist();
  }

  replanInFlight = true;
  setStatus(`Auto-replan: ${flight.replan.reason}`, "info");
  await sendEvent("auto_replan_triggered", "results", {
    trigger: flight.replan.trigger,
    delayMinutes: flight.delayMinutes,
  });
  form.requestSubmit();
}

async function fetchFlightStatus({ triggerAutoReplan = false } = {}) {
  const payload = getFlightPayloadFromState();
  if (!payload?.airportCode || !payload?.departureTime) {
    return;
  }
  try {
    const response = await fetch("/api/flight-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch flight status.");
    }
    sessionKey = data.sessionKey || sessionKey;
    lastFlightSnapshot = data.flight || null;
    renderFlightStatus(data.flight);
    renderReplanHistory(data.replanHistory || []);
    if (triggerAutoReplan) {
      await maybeAutoReplan(data.flight);
    }
  } catch (error) {
    flightStatusLineEl.textContent = `Flight status unavailable: ${error.message}`;
  }
}

function stopFlightPolling() {
  if (flightPollTimer) {
    clearInterval(flightPollTimer);
    flightPollTimer = null;
  }
}

function startFlightPolling() {
  stopFlightPolling();
  flightPollTimer = setInterval(() => {
    fetchFlightStatus({ triggerAutoReplan: true }).catch(() => {});
  }, FLIGHT_POLL_INTERVAL_MS);
}

function updateSummary(data, payload = null) {
  lastPlanData = data;
  if (payload) {
    lastRequestPayload = payload;
  }
  sessionKey = data.session?.key || sessionKey;
  renderDecisionBanner(data);
  renderDecisionWhy(data);
  renderScoreBreakdown(data);
  renderAllocation(data);
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
    `Profile ${data.request.riskProfile || "balanced"}`,
    `Pack ${data.request.strategyPack || "standard"}`,
  ];
  const arrivalValue = lastRequestPayload?.arrivalTime || data.request?.arrivalTime;
  const airlineCode = lastRequestPayload?.airlineCode || data.request?.airlineCode;
  const flightNumber = lastRequestPayload?.flightNumber || data.request?.flightNumber;
  if (arrivalValue) {
    requestSegments.push(`Arrival ${formatDateTime(arrivalValue)}`);
  }
  requestSegments.push(`Departure ${formatDateTime(data.request.departureTime)}`);
  if (airlineCode || flightNumber) {
    requestSegments.push(`Flight ${(airlineCode || "") + (flightNumber || "")}`);
  }
  if (data.observability?.generatedInMs != null) {
    requestSegments.push(`Plan ${data.observability.generatedInMs} ms`);
  }
  requestMetaEl.textContent = requestSegments.join(" · ");
  renderSharePreview(data);
  updateActionCenter(data);
  renderFlightStatus(data.flight || null);
  renderReplanHistory(data.replanHistory || []);

  renderSafetyChecklist(data);
  renderSchedule(data.schedule || []);
  renderSelectedPoi(data.map?.selectedPoi || null);
  renderCandidates(data.map?.candidates || []);
  renderMap(data.map);
  setTabLabels({
    timelineCount: Array.isArray(data.schedule) ? data.schedule.length : 0,
    alternativesCount: Array.isArray(data.map?.candidates) ? data.map.candidates.length : 0,
  });

  selectedCandidateIndex = data.map?.candidates?.length ? 0 : -1;
  if (selectedCandidateIndex === 0) {
    renderCandidates(data.map.candidates);
  }
  setActiveTab("decision");
  sendEvent("plan_generated", "results", {
    airportCode: data.request?.airportCode,
    riskLabel: data.feasibility?.riskLabel,
    score: data.feasibility?.score,
    strategyPack: data.request?.strategyPack,
    riskProfile: data.request?.riskProfile,
  });
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
  const flightContext = getFlightContext();

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
  if (!trustAcknowledgedInput?.checked) {
    throw new Error("Confirm guidance acknowledgment before generating a plan.");
  }

  if (airlineCodeInput) {
    airlineCodeInput.value = flightContext.airlineCode;
  }
  if (flightNumberInput) {
    flightNumberInput.value = flightContext.flightNumber;
  }

  return {
    airportCode: formData.get("airportCode"),
    arrivalTime: arrivalValue,
    departureTime: departureValue,
    connectionType: formData.get("connectionType"),
    riskProfile: normalizeRiskProfile(formData.get("riskProfile")),
    strategyPack: normalizeStrategyPack(selectedStrategyPack),
    interests: formData.getAll("interests"),
    airlineCode: flightContext.airlineCode || null,
    flightNumber: flightContext.flightNumber || null,
    trustAcknowledged: Boolean(trustAcknowledgedInput?.checked),
    sessionKey,
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Building plan...", "info");
  startBuildProgressTicker();
  submitButton.disabled = true;
  setLoadingState(true);
  await sendEvent("plan_submit", "planner", {
    airportCode: form.elements.airportCode.value,
    riskProfile: normalizeRiskProfile(form.elements.riskProfile?.value),
    strategyPack: selectedStrategyPack,
  });

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
    await fetchFlightStatus({ triggerAutoReplan: false });
    startFlightPolling();
    resultsTopEl.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus("Plan generated.", "success");
    setBuildProgressMessage("Plan ready. Open tabs to inspect details.");
  } catch (error) {
    setStatus(error.message, "error");
    setBuildProgressMessage("Generation stopped. Adjust inputs and retry.");
    await sendEvent("plan_submit_failed", "planner", { message: error.message });
  } finally {
    stopBuildProgressTicker();
    submitButton.disabled = false;
    setLoadingState(false);
    replanInFlight = false;
  }
});

resetPlannerBtn.addEventListener("click", () => {
  setDefaultArrivalTime();
  setDefaultDepartureTime();
  setActivePreset(5);
  form.elements.connectionType.value = "domestic";
  if (form.elements.riskProfile) {
    form.elements.riskProfile.value = "balanced";
  }
  setStrategyPack("standard", { emitEvent: false });
  if (autoReplanInput) {
    autoReplanInput.checked = true;
  }
  if (trustAcknowledgedInput) {
    trustAcknowledgedInput.checked = false;
  }
  const interests = Array.from(form.querySelectorAll("input[name='interests']"));
  interests.forEach((checkbox, index) => {
    checkbox.checked = index < 2;
  });
  if (airlineCodeInput) {
    airlineCodeInput.value = "";
  }
  if (flightNumberInput) {
    flightNumberInput.value = "";
  }
  updateTicketLinks();
  updatePlannerChecklist();
  resetResultsView();
  setStatus("Planner reset.", "info");
  sendEvent("planner_reset", "planner", {});
});

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

for (const button of packButtons) {
  button.addEventListener("click", () => {
    const pack = button.dataset.pack;
    if (!pack) {
      return;
    }
    setStrategyPack(pack);
    updatePlannerChecklist();
  });
}

if (riskProfileSelect) {
  riskProfileSelect.addEventListener("change", () => {
    const profile = normalizeRiskProfile(riskProfileSelect.value);
    sendEvent("risk_profile_selected", "planner", { riskProfile: profile });
  });
}

if (autoReplanInput) {
  autoReplanInput.addEventListener("change", () => {
    sendEvent("auto_replan_toggled", "planner", { enabled: autoReplanInput.checked });
  });
}

if (openAirportMapBtn) {
  openAirportMapBtn.addEventListener("click", () => {
    const url = openAirportMapBtn.dataset.href;
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    sendEvent("action_center_click", "results", { action: "airport_map" });
  });
}

if (openRideLinkBtn) {
  openRideLinkBtn.addEventListener("click", () => {
    const url = openRideLinkBtn.dataset.href;
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    sendEvent("action_center_click", "results", { action: "ride_estimate" });
  });
}

if (toggleShareCardBtn && shareCardEl) {
  toggleShareCardBtn.addEventListener("click", () => {
    shareCardEl.classList.toggle("hidden");
    toggleShareCardBtn.textContent = shareCardEl.classList.contains("hidden")
      ? "Show share card"
      : "Hide share card";
    sendEvent("action_center_click", "results", {
      action: shareCardEl.classList.contains("hidden") ? "hide_share_card" : "show_share_card",
    });
  });
}

for (const button of feedbackButtons) {
  button.addEventListener("click", () => {
    const score = Number(button.dataset.score);
    if (!Number.isFinite(score)) {
      return;
    }
    selectedFeedbackScore = score;
    feedbackButtons.forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    if (feedbackStatusEl) {
      feedbackStatusEl.textContent = `Selected rating: ${score}/5`;
      feedbackStatusEl.classList.remove("warn");
    }
  });
}

if (feedbackSubmitBtn) {
  feedbackSubmitBtn.addEventListener("click", async () => {
    if (!selectedFeedbackScore) {
      feedbackStatusEl.textContent = "Choose a rating before sending feedback.";
      feedbackStatusEl.classList.add("warn");
      return;
    }
    if (!lastPlanData) {
      feedbackStatusEl.textContent = "Generate a plan before sending feedback.";
      feedbackStatusEl.classList.add("warn");
      return;
    }
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: selectedFeedbackScore,
          sentiment: selectedFeedbackScore >= 4 ? "positive" : selectedFeedbackScore <= 2 ? "negative" : "neutral",
          comment: feedbackCommentInput?.value || "",
          sessionKey,
          airportCode: lastPlanData.request?.airportCode,
          riskLabel: lastPlanData.feasibility?.riskLabel,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Feedback submission failed.");
      }
      feedbackStatusEl.textContent = `Feedback sent (${selectedFeedbackScore}/5). Thank you.`;
      feedbackStatusEl.classList.remove("warn");
      await sendEvent("feedback_submitted", "results", { score: selectedFeedbackScore });
    } catch (error) {
      feedbackStatusEl.textContent = error.message;
      feedbackStatusEl.classList.add("warn");
    }
  });
}

form.addEventListener("change", () => {
  updatePlannerChecklist();
});

form.addEventListener("input", () => {
  updatePlannerChecklist();
  updateTicketLinks();
  if (buildProgressTimer == null) {
    setBuildProgressMessage("");
  }
});

setDefaultArrivalTime();
setDefaultDepartureTime();
setActivePreset(5);
if (riskProfileSelect) {
  riskProfileSelect.value = "balanced";
}
setStrategyPack("standard", { emitEvent: false });
setTabLabels();
updateTicketLinks();
updatePlannerChecklist();
initMap();
setActiveTab(activeTab);
resetResultsView();
Promise.all([checkApiHealth(), loadConfig()]).catch((error) => {
  setStatus(`Failed to load configuration: ${error.message}`, "error");
});

setInterval(() => {
  checkApiHealth().catch(() => {});
}, 60000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && lastPlanData) {
    fetchFlightStatus({ triggerAutoReplan: true }).catch(() => {});
  }
});

window.addEventListener("beforeunload", () => {
  stopFlightPolling();
});
