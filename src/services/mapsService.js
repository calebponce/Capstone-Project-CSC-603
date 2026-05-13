const { conservativeDriveMinutes, haversineDistanceKm } = require("../utils/geo");
const { POI_DENYLIST_CATEGORIES } = require("../config/airports");

const CATEGORY_KEYS = ["natural", "tourism", "historic", "leisure", "amenity", "shop", "route"];

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

function buildInterestQueries(selectors) {
  const lines = [];
  for (const selector of selectors) {
    if (!selector?.key || !selector?.value) continue;
    const key = selector.key;
    const value = selector.value;
    const elements = Array.isArray(selector.elements)
      ? selector.elements
      : selector.element
        ? [selector.element]
        : ["node", "way"];
    for (const el of elements) {
      lines.push(`${el}["${key}"="${value}"](around:RADIUS,LAT,LON);`);
    }
  }
  return lines.join("\n      ");
}

function selectorKey(selectors) {
  return selectors
    .map((s) => `${s.key}=${s.value}`)
    .sort()
    .join(",");
}

function pickCategory(tags) {
  if (!tags) return "poi";
  for (const key of CATEGORY_KEYS) {
    if (tags[key]) return String(tags[key]);
  }
  return "poi";
}

function nameOf(element) {
  const tags = element?.tags || {};
  return (
    tags.name ||
    tags["name:en"] ||
    tags["official_name"] ||
    tags["loc_name"] ||
    null
  );
}

// Categories that ARE the destination on their own (a real beach is interesting
// even without a wikipedia entry). Other categories need notability signals.
const SELF_NOTABLE_CATEGORIES = new Set([
  "beach",
  "museum",
  "gallery",
  "theme_park",
  "zoo",
  "aquarium",
  "castle",
  "ruins",
  "aquarium",
  "monument",
  "memorial",
  "nature_reserve",
]);

// Categories where most named OSM entries are mediocre (small neighborhood parks,
// random viewpoints, no-name picnic sites). These need a notability signal to survive.
const NEEDS_SIGNAL_CATEGORIES = new Set([
  "park",
  "viewpoint",
  "picnic_site",
  "garden",
  "attraction",
  "artwork",
  "memorial",
]);

function scoreNotability(tags, category) {
  if (!tags) return 0;
  let score = 0;

  // Wikipedia/Wikidata = real notability
  if (tags.wikidata) score += 4;
  if (tags.wikipedia) score += 3;

  // Heritage listings = curated significance
  if (tags.heritage) score += 3;
  if (tags["heritage:operator"]) score += 1;

  // Real operating venues
  if (tags.website) score += 2;
  if (tags.opening_hours) score += 1;
  if (tags.phone) score += 1;
  if (tags.email) score += 1;

  // Curators bothered to add these
  if (tags.image) score += 2;
  if (tags.description) score += 1;
  if (tags["description:en"]) score += 1;
  if (tags.wikimedia_commons) score += 1;

  // Tourism/historic tags that imply destination intent
  if (tags.tourism === "attraction") score += 2;
  if (tags.tourism === "museum" || tags.tourism === "gallery") score += 3;
  if (tags.tourism === "theme_park" || tags.tourism === "zoo" || tags.tourism === "aquarium") score += 3;
  if (tags.historic && tags.historic !== "no") score += 1;

  // National/state designation usually means somewhere worth visiting
  if (tags["protect_class"]) score += 2;
  if (tags["protection_title"]) score += 1;
  if (tags["boundary"] === "national_park") score += 4;
  if (tags["boundary"] === "protected_area") score += 2;
  if (tags.operator && /national|state|county|park service/i.test(tags.operator)) score += 1;

  // Internationally named places
  if (tags["name:en"] || tags["name:fr"] || tags["name:es"] || tags["name:zh"]) score += 1;

  // Self-notable categories get a baseline floor
  if (SELF_NOTABLE_CATEGORIES.has(category)) score += 2;

  return score;
}

async function fetchPois({ airport, selectors }) {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return [];
  }

  const cacheKey = `pois:v3:${airport.code}:${selectorKey(selectors)}`;
  const query = `
    [out:json][timeout:25];
    (
      ${buildInterestQueries(selectors)}
    );
    out center 60;
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
      cacheKey,
      cacheTtlMs: POI_CACHE_TTL_MS,
      retries: 2,
      retryDelayMs: 320,
    }
  );

  const byNameLoc = new Map();

  for (const element of data.elements || []) {
    const name = nameOf(element);
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!name || lat == null || lon == null) continue;

    const category = pickCategory(element.tags);
    if (POI_DENYLIST_CATEGORIES.has(category)) continue;

    const tags = element.tags || {};
    const notability = scoreNotability(tags, category);

    // Filter out forgettable noise: categories that need a notability signal AND don't have one.
    if (NEEDS_SIGNAL_CATEGORIES.has(category) && notability < 2) continue;

    // For everything else, require at least *some* signal of being a real venue.
    if (!SELF_NOTABLE_CATEGORIES.has(category) && notability === 0) continue;

    // Dedupe ways/nodes that share a name within ~120m; keep the one with the higher notability.
    const nameKey = `${name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    const prior = byNameLoc.get(nameKey);
    if (prior && prior.notability >= notability) continue;

    const id = `${element.type || "node"}-${element.id || `${lat}-${lon}`}`;

    byNameLoc.set(nameKey, {
      id,
      name,
      lat,
      lon,
      category,
      notability,
      wikidata: tags.wikidata || null,
      wikipedia: tags.wikipedia || null,
      hasWebsite: Boolean(tags.website),
      hasHours: Boolean(tags.opening_hours),
      isHeritage: Boolean(tags.heritage),
      address: [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:city"],
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  // Sort by notability descending so itineraryService keeps the best 20.
  return Array.from(byNameLoc.values()).sort((a, b) => (b.notability || 0) - (a.notability || 0));
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
