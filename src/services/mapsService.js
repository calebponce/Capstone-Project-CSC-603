const { conservativeDriveMinutes, haversineDistanceKm } = require("../utils/geo");

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json();
}

async function getRouteEstimateMinutes(origin, destination, mode = "driving") {
  const profile = mode === "walking" ? "walking" : "driving";
  const routeUrl = `https://router.project-osrm.org/route/v1/${profile}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`;

  try {
    const data = await fetchJson(routeUrl, {
      headers: { "User-Agent": "LayoverPlus/1.0" },
    });

    const seconds = data.routes?.[0]?.duration;
    if (!seconds) {
      throw new Error("No route returned");
    }

    return Math.max(1, Math.round(seconds / 60));
  } catch (_error) {
    const distanceKm = haversineDistanceKm(origin.lat, origin.lon, destination.lat, destination.lon);
    return conservativeDriveMinutes(distanceKm);
  }
}

function buildInterestQueries(tags) {
  return tags
    .map((tag) => {
      return `
        node["tourism"="${tag}"](around:RADIUS,LAT,LON);
        node["amenity"="${tag}"](around:RADIUS,LAT,LON);
        node["shop"="${tag}"](around:RADIUS,LAT,LON);
        node["leisure"="${tag}"](around:RADIUS,LAT,LON);
      `;
    })
    .join("\n");
}

async function fetchPois({ airport, tags }) {
  const query = `
    [out:json][timeout:25];
    (
      ${buildInterestQueries(tags)}
    );
    out center 20;
  `
    .replaceAll("RADIUS", String(airport.searchRadiusMeters))
    .replaceAll("LAT", String(airport.lat))
    .replaceAll("LON", String(airport.lon));

  const data = await fetchJson("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "User-Agent": "LayoverPlus/1.0",
    },
    body: query,
  });

  const seen = new Set();

  return (data.elements || [])
    .map((element) => {
      const name = element.tags?.name;
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (!name || lat == null || lon == null) {
        return null;
      }

      const id = `${name}-${lat}-${lon}`;
      if (seen.has(id)) {
        return null;
      }
      seen.add(id);

      return {
        id,
        name,
        lat,
        lon,
        category:
          element.tags?.tourism ||
          element.tags?.amenity ||
          element.tags?.shop ||
          element.tags?.leisure ||
          "poi",
        address: [
          element.tags?.["addr:housenumber"],
          element.tags?.["addr:street"],
          element.tags?.["addr:city"],
        ]
          .filter(Boolean)
          .join(" "),
      };
    })
    .filter(Boolean);
}

module.exports = {
  fetchPois,
  getRouteEstimateMinutes,
};
