const airportSelect = document.getElementById("airportCode");
const interestsContainer = document.getElementById("interests");
const form = document.getElementById("planner-form");
const statusEl = document.getElementById("status");
const submitButton = form.querySelector("button[type='submit']");

const resultTitle = document.getElementById("result-title");
const riskPill = document.getElementById("risk-pill");
const scoreEl = document.getElementById("score");
const layoverEl = document.getElementById("layover");
const processingEl = document.getElementById("processing");
const bufferEl = document.getElementById("buffer");
const narrativeEl = document.getElementById("narrative");
const requestMetaEl = document.getElementById("request-meta");
const scheduleEl = document.getElementById("schedule");
const candidatesEl = document.getElementById("candidates");

const apiTitleEl = document.getElementById("api-title");
const apiStatusEl = document.getElementById("api-status");
const apiLatencyEl = document.getElementById("api-latency");
const apiLastCheckEl = document.getElementById("api-last-check");
const apiServerTimeEl = document.getElementById("api-server-time");
const apiMessageEl = document.getElementById("api-message");
const refreshApiButton = document.getElementById("refresh-api");

let map;
let layerGroup;

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

function setDefaultDepartureTime() {
  const input = document.getElementById("departureTime");
  const later = new Date(Date.now() + 5 * 60 * 60 * 1000);
  later.setMinutes(0, 0, 0);
  input.value = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}-${String(
    later.getDate()
  ).padStart(2, "0")}T${String(later.getHours()).padStart(2, "0")}:${String(
    later.getMinutes()
  ).padStart(2, "0")}`;
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
    scheduleEl.className = "schedule empty";
    scheduleEl.textContent = "No safe off-airport itinerary for the current layover window.";
    return;
  }

  scheduleEl.className = "schedule";
  scheduleEl.innerHTML = schedule
    .map((item) => {
      return `
        <article class="schedule-item">
          <p><strong>${escapeHtml(item.start)}</strong> to <strong>${escapeHtml(item.end)}</strong></p>
          <p>${escapeHtml(item.label)}<br /><span>${escapeHtml(item.location)}</span></p>
          <p><strong>${escapeHtml(formatMinutes(item.minutes))}</strong></p>
        </article>
      `;
    })
    .join("");
}

function renderCandidates(candidates) {
  if (!candidates.length) {
    candidatesEl.className = "candidate-list empty";
    candidatesEl.textContent = "No nearby candidates found for this request.";
    return;
  }

  candidatesEl.className = "candidate-list";
  candidatesEl.innerHTML = candidates
    .map((candidate, index) => {
      const riskClass = candidate.riskLabel ? candidate.riskLabel.toLowerCase() : "neutral";
      return `
        <article class="candidate-item">
          <div>
            <p class="candidate-title">${index + 1}. ${escapeHtml(candidate.name)}</p>
            <p class="candidate-meta">${escapeHtml(candidate.category || "poi")}</p>
          </div>
          <div class="candidate-score">
            <span>${escapeHtml(String(candidate.score ?? "-"))}/100</span>
            <span class="risk-chip ${riskClass}">${escapeHtml(candidate.riskLabel || "Unknown")}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMap(mapData) {
  layerGroup.clearLayers();

  const points = [];
  const airportMarker = L.marker([mapData.airport.lat, mapData.airport.lon]).bindPopup(
    `<strong>${escapeHtml(mapData.airport.name)}</strong><br />Airport`
  );
  airportMarker.addTo(layerGroup);
  points.push([mapData.airport.lat, mapData.airport.lon]);

  mapData.candidates.forEach((candidate) => {
    const marker = L.circleMarker([candidate.lat, candidate.lon], {
      radius: 7,
      color:
        candidate.riskLabel === "Low"
          ? "#166534"
          : candidate.riskLabel === "Medium"
            ? "#b45309"
            : "#b91c1c",
      fillOpacity: 0.8,
    }).bindPopup(
      `<strong>${escapeHtml(candidate.name)}</strong><br />${escapeHtml(candidate.category || "poi")}<br />Score: ${escapeHtml(candidate.score ?? "-")}`
    );
    marker.addTo(layerGroup);
    points.push([candidate.lat, candidate.lon]);
  });

  if (mapData.selectedPoi) {
    const line = L.polyline(
      [
        [mapData.airport.lat, mapData.airport.lon],
        [mapData.selectedPoi.lat, mapData.selectedPoi.lon],
      ],
      {
        color: "#0f766e",
        weight: 4,
        dashArray: "12 8",
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

function setApiStatus({
  state = "checking",
  latency = "-",
  lastCheck = "-",
  serverTime = "-",
  message = "",
} = {}) {
  apiStatusEl.textContent = state === "online" ? "Online" : state === "offline" ? "Offline" : "Checking...";
  apiStatusEl.className = `api-badge ${state}`;
  apiTitleEl.textContent =
    state === "online" ? "Backend reachable" : state === "offline" ? "Backend unreachable" : "Backend status";
  apiLatencyEl.textContent = latency;
  apiLastCheckEl.textContent = lastCheck;
  apiServerTimeEl.textContent = serverTime;
  apiMessageEl.textContent = message;
}

async function checkApiHealth() {
  setApiStatus({ state: "checking", message: "Running API health check..." });
  const startedAt = performance.now();

  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - startedAt);
    const data = await response.json();

    if (!response.ok || data.status !== "ok") {
      throw new Error(data.error || "Health endpoint returned a non-ok status.");
    }

    setApiStatus({
      state: "online",
      latency: `${latencyMs} ms`,
      lastCheck: formatDateTime(new Date()),
      serverTime: formatDateTime(data.timestamp),
      message: `Uptime ${Math.round((data.uptimeSeconds || 0) / 60)} minutes · v${data.version || "unknown"}`,
    });
    return true;
  } catch (error) {
    setApiStatus({
      state: "offline",
      latency: "-",
      lastCheck: formatDateTime(new Date()),
      serverTime: "-",
      message: error.message || "Could not reach API",
    });
    return false;
  }
}

function updateSummary(data) {
  resultTitle.textContent = data.map.selectedPoi
    ? data.map.selectedPoi.name
    : `Stay at ${data.airport.code}`;
  riskPill.textContent = `${data.feasibility.riskLabel} Risk`;
  riskPill.className = `risk-pill ${data.feasibility.riskLabel.toLowerCase()}`;
  scoreEl.textContent = `${data.feasibility.score}/100`;
  layoverEl.textContent = `${data.summary.layoverMinutes} min`;
  processingEl.textContent = `${data.summary.processingMinutes} min`;
  bufferEl.textContent = `${data.summary.returnBufferMinutes} min`;
  narrativeEl.textContent = data.narrative;
  requestMetaEl.textContent =
    `Request: ${data.request.airportCode} · ${data.request.connectionType} · Departure ${formatDateTime(data.request.departureTime)}`;
  renderSchedule(data.schedule);
  renderCandidates(data.map.candidates || []);
  renderMap(data.map);
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
  const departureValue = formData.get("departureTime");
  const departureDate = new Date(departureValue);

  if (!departureValue || Number.isNaN(departureDate.getTime())) {
    throw new Error("Choose a valid departure time.");
  }

  if (departureDate.getTime() < Date.now()) {
    throw new Error("Departure time must be in the future.");
  }

  return {
    airportCode: formData.get("airportCode"),
    departureTime: departureValue,
    connectionType: formData.get("connectionType"),
    interests: formData.getAll("interests"),
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "Building plan...";
  submitButton.disabled = true;

  try {
    const payload = getPayloadFromForm();
    const apiReachable = await checkApiHealth();
    if (!apiReachable) {
      throw new Error("API is not reachable. Start/restart the server and retry.");
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

    updateSummary(data);
    statusEl.textContent = "";
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

refreshApiButton.addEventListener("click", async () => {
  await checkApiHealth();
});

setDefaultDepartureTime();
initMap();
Promise.all([checkApiHealth(), loadConfig()]).catch((error) => {
  statusEl.textContent = `Failed to load configuration: ${error.message}`;
});
