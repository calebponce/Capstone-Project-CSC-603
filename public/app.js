const airportSelect = document.getElementById("airportCode");
const interestsContainer = document.getElementById("interests");
const form = document.getElementById("planner-form");
const statusEl = document.getElementById("status");

const resultTitle = document.getElementById("result-title");
const riskPill = document.getElementById("risk-pill");
const scoreEl = document.getElementById("score");
const layoverEl = document.getElementById("layover");
const processingEl = document.getElementById("processing");
const bufferEl = document.getElementById("buffer");
const narrativeEl = document.getElementById("narrative");
const scheduleEl = document.getElementById("schedule");

let map;
let layerGroup;

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
          <p><strong>${item.start}</strong> to <strong>${item.end}</strong></p>
          <p>${item.label}<br /><span>${item.location}</span></p>
          <p><strong>${item.minutes} min</strong></p>
        </article>
      `;
    })
    .join("");
}

function renderMap(mapData) {
  layerGroup.clearLayers();

  const points = [];
  const airportMarker = L.marker([mapData.airport.lat, mapData.airport.lon]).bindPopup(
    `<strong>${mapData.airport.name}</strong><br />Airport`
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
      `<strong>${candidate.name}</strong><br />${candidate.category}<br />Score: ${candidate.score}`
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
  renderSchedule(data.schedule);
  renderMap(data.map);
}

async function loadConfig() {
  const response = await fetch("/api/config");
  const config = await response.json();

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "Building plan...";

  const formData = new FormData(form);
  const interests = formData.getAll("interests");

  const payload = {
    airportCode: formData.get("airportCode"),
    departureTime: formData.get("departureTime"),
    connectionType: formData.get("connectionType"),
    interests,
  };

  try {
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
  }
});

setDefaultDepartureTime();
initMap();
loadConfig().catch((error) => {
  statusEl.textContent = `Failed to load configuration: ${error.message}`;
});
