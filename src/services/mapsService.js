const { conservativeDriveMinutes, haversineDistanceKm } = require("../utils/geo");

const runtimeStats = {
  cacheHits: 0,
  cacheMisses: 0,
  requestRetries: 0,
  requestFailures: 0,
};

const cacheStore = new Map();
const ROUTE_CACHE_TTL_MS = 8 * 60 * 1000;
const POI_CACHE_TTL_MS = 10 * 60 * 1000;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readCache(cacheKey) {
  if (!cacheKey) {
    return null;
  }
  const cached = cacheStore.get(cacheKey);
  if (!cached) {
    runtimeStats.cacheMisses += 1;
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    cacheStore.delete(cacheKey);
    runtimeStats.cacheMisses += 1;
    return null;
  }
  runtimeStats.cacheHits += 1;
  return cloneJson(cached.data);
}

function writeCache(cacheKey, data, ttlMs) {
  if (!cacheKey || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return;
  }
  cacheStore.set(cacheKey, {
    data: cloneJson(data),
    expiresAt: Date.now() + ttlMs,
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchJson(
  url,
  options = {},
  { cacheKey = null, cacheTtlMs = 0, retries = 1, retryDelayMs = 180 } = {}
) {
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  let lastError = null;
  const attempts = Math.max(1, retries + 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`Request failed with ${response.status}`);
        }
        throw new Error(`Retryable request failure ${response.status}`);
      }

      const data = await response.json();
      writeCache(cacheKey, data, cacheTtlMs);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        runtimeStats.requestRetries += 1;
        await delay(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }

  runtimeStats.requestFailures += 1;
  throw lastError || new Error("Request failed.");
}

async function getRouteEstimateMinutes(origin, destination, mode = "driving") {
  const profile = mode === "walking" ? "walking" : "driving";
  const routeUrl = `https://router.project-osrm.org/route/v1/${profile}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`;
  const routeCacheKey = [
    "route",
    profile,
    origin.lat.toFixed(4),
    origin.lon.toFixed(4),
    destination.lat.toFixed(4),
    destination.lon.toFixed(4),
  ].join(":");

  try {
    const data = await fetchJson(routeUrl, {
      headers: { "User-Agent": "LayoverPlus/1.0" },
    }, {
      cacheKey: routeCacheKey,
      cacheTtlMs: ROUTE_CACHE_TTL_MS,
      retries: 2,
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
  const normalizedTags = [...new Set(tags)].sort();
  const query = `
    [out:json][timeout:25];
    (
      ${buildInterestQueries(normalizedTags)}
    );
    out center 20;
  `
    .replaceAll("RADIUS", String(airport.searchRadiusMeters))
    .replaceAll("LAT", String(airport.lat))
    .replaceAll("LON", String(airport.lon));

  const data = await fetchJson(
    "https://overpass-api.de/api/interpreter",
    {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        "User-Agent": "LayoverPlus/1.0",
      },
      body: query,
    },
    {
      cacheKey: `pois:${airport.code}:${normalizedTags.join(",")}`,
      cacheTtlMs: POI_CACHE_TTL_MS,
      retries: 2,
      retryDelayMs: 320,
    }
  );

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

function getMapsRuntimeStats() {
  const now = Date.now();
  let activeCacheEntries = 0;
  for (const value of cacheStore.values()) {
    if (value.expiresAt > now) {
      activeCacheEntries += 1;
    }
  }
  return {
    cacheEntries: activeCacheEntries,
    cacheHits: runtimeStats.cacheHits,
    cacheMisses: runtimeStats.cacheMisses,
    requestRetries: runtimeStats.requestRetries,
    requestFailures: runtimeStats.requestFailures,
  };
}

module.exports = {
  fetchPois,
  getRouteEstimateMinutes,
  getMapsRuntimeStats,
};
