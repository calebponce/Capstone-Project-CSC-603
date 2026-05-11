function sanitizeText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getGooglePlacesApiKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_KEY ||
    null
  );
}

function getYelpApiKey() {
  return process.env.YELP_API_KEY || process.env.YELP_FUSION_API_KEY || null;
}

function encodeQuery(value) {
  return encodeURIComponent(String(value || ""));
}

function buildAppleMapsUri({ name, lat, lon }) {
  return `https://maps.apple.com/?q=${encodeQuery(name)}&ll=${lat},${lon}`;
}

function buildGoogleMapsFallbackUri({ name, lat, lon }) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeQuery(
    `${name} ${lat},${lon}`
  )}`;
}

function buildYelpSearchUri({ name, lat, lon }) {
  return `https://www.yelp.com/search?find_desc=${encodeQuery(name)}&l=g:${lat},${lon},2000`;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 4200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function pickReviewText(review) {
  if (!review || typeof review !== "object") {
    return "";
  }
  if (typeof review.text?.text === "string" && review.text.text.trim()) {
    return review.text.text.trim();
  }
  if (typeof review.originalText?.text === "string" && review.originalText.text.trim()) {
    return review.originalText.text.trim();
  }
  if (typeof review.text === "string" && review.text.trim()) {
    return review.text.trim();
  }
  return "";
}

function normalizeGoogleReview(review) {
  const text = pickReviewText(review);
  if (!text) {
    return null;
  }

  return {
    author:
      sanitizeText(review.authorAttribution?.displayName, 80) ||
      sanitizeText(review.authorName, 80) ||
      "Google user",
    rating: Number.isFinite(review.rating) ? review.rating : null,
    text: sanitizeText(text, 320),
    publishTime: sanitizeText(review.publishTime, 60) || null,
    source: "google",
    sourceUrl:
      sanitizeText(review.authorAttribution?.uri, 320) ||
      sanitizeText(review.authorUrl, 320) ||
      null,
  };
}

function normalizeYelpReview(review) {
  if (!review || typeof review !== "object") {
    return null;
  }
  const text = sanitizeText(review.text, 320);
  if (!text) {
    return null;
  }
  return {
    author: sanitizeText(review.user?.name, 80) || "Yelp user",
    rating: Number.isFinite(review.rating) ? review.rating : null,
    text,
    publishTime: sanitizeText(review.time_created, 60) || null,
    source: "yelp",
    sourceUrl: sanitizeText(review.url, 320) || null,
  };
}

function normalizePlaceSummary(place, { fallbackName, fallbackLat, fallbackLon }) {
  const location = place?.location || {};
  const displayName =
    sanitizeText(place?.displayName?.text, 120) ||
    sanitizeText(place?.displayName, 120) ||
    sanitizeText(fallbackName, 120);

  const photoRefs = Array.isArray(place?.photos)
    ? place.photos
        .map((photo) => sanitizeText(photo?.name, 220))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    name: displayName,
    lat: normalizeCoordinate(location.latitude) ?? fallbackLat,
    lon: normalizeCoordinate(location.longitude) ?? fallbackLon,
    address: sanitizeText(place?.formattedAddress, 180) || "",
    rating: Number.isFinite(place?.rating) ? place.rating : null,
    reviewCount: Number.isFinite(place?.userRatingCount) ? place.userRatingCount : null,
    googleMapsUri: sanitizeText(place?.googleMapsUri, 400) || null,
    websiteUri: sanitizeText(place?.websiteUri, 300) || null,
    openNow: typeof place?.regularOpeningHours?.openNow === "boolean" ? place.regularOpeningHours.openNow : null,
    editorialSummary: sanitizeText(place?.editorialSummary?.text, 280) || null,
    priceLevel: sanitizeText(place?.priceLevel, 30) || null,
    photoRefs,
  };
}

function buildGooglePhotoProxyUrl(photoName) {
  return `/api/place-photo?provider=google&photoName=${encodeQuery(photoName)}`;
}

function buildGooglePhotos(photoRefs) {
  return (photoRefs || []).slice(0, 4).map((photoName, index) => ({
    id: `google-${index}-${photoName}`,
    provider: "google",
    url: buildGooglePhotoProxyUrl(photoName),
    caption: "Google place photo",
  }));
}

async function fetchGooglePreview({ name, lat, lon }) {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return null;
  }

  const textQuery = sanitizeText(name, 120);
  if (!textQuery) {
    return null;
  }

  const searchUrl = "https://places.googleapis.com/v1/places:searchText";
  const searchBody = {
    textQuery,
    maxResultCount: 1,
    languageCode: "en",
    locationBias: {
      circle: {
        center: {
          latitude: lat,
          longitude: lon,
        },
        radius: 2200,
      },
    },
  };

  const searchResponse = await fetchJsonWithTimeout(searchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.photos",
    },
    body: JSON.stringify(searchBody),
  });

  const firstPlace = searchResponse?.places?.[0];
  if (!firstPlace?.id) {
    return null;
  }

  let detailPlace = firstPlace;
  try {
    const detailUrl = `https://places.googleapis.com/v1/places/${firstPlace.id}`;
    detailPlace = await fetchJsonWithTimeout(detailUrl, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,rating,userRatingCount,googleMapsUri,websiteUri,regularOpeningHours.openNow,editorialSummary,reviews,photos,priceLevel",
      },
    });
  } catch (_error) {
    // Fallback to search-level metadata when details cannot be fetched.
  }

  const placeSummary = normalizePlaceSummary(detailPlace, {
    fallbackName: name,
    fallbackLat: lat,
    fallbackLon: lon,
  });
  const reviews = Array.isArray(detailPlace?.reviews)
    ? detailPlace.reviews.map(normalizeGoogleReview).filter(Boolean).slice(0, 3)
    : [];

  return {
    provider: "google",
    place: {
      ...placeSummary,
    },
    photos: buildGooglePhotos(placeSummary.photoRefs),
    reviews,
  };
}

function normalizeYelpBusinessSummary(business) {
  if (!business || typeof business !== "object") {
    return null;
  }
  return {
    id: sanitizeText(business.id, 80) || null,
    name: sanitizeText(business.name, 120) || null,
    rating: Number.isFinite(business.rating) ? business.rating : null,
    reviewCount: Number.isFinite(business.review_count) ? business.review_count : null,
    priceLevel: sanitizeText(business.price, 16) || null,
    url: sanitizeText(business.url, 400) || null,
    imageUrl: sanitizeText(business.image_url, 420) || null,
    categories: Array.isArray(business.categories)
      ? business.categories
          .map((category) => sanitizeText(category?.title, 80))
          .filter(Boolean)
          .slice(0, 4)
      : [],
    photos: Array.isArray(business.photos)
      ? business.photos.map((url) => sanitizeText(url, 420)).filter(Boolean).slice(0, 4)
      : [],
  };
}

async function fetchYelpPreview({ name, lat, lon }) {
  const apiKey = getYelpApiKey();
  if (!apiKey) {
    return null;
  }

  const searchUrl = new URL("https://api.yelp.com/v3/businesses/search");
  searchUrl.searchParams.set("term", sanitizeText(name, 120));
  searchUrl.searchParams.set("latitude", String(lat));
  searchUrl.searchParams.set("longitude", String(lon));
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("sort_by", "best_match");
  searchUrl.searchParams.set("radius", "2400");
  searchUrl.searchParams.set("locale", "en_US");

  const yelpHeaders = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const searchData = await fetchJsonWithTimeout(searchUrl.toString(), { headers: yelpHeaders }, 4300);
  const firstBusiness = searchData?.businesses?.[0];
  if (!firstBusiness?.id) {
    return null;
  }

  let detailBusiness = firstBusiness;
  try {
    detailBusiness = await fetchJsonWithTimeout(
      `https://api.yelp.com/v3/businesses/${encodeQuery(firstBusiness.id)}`,
      { headers: yelpHeaders },
      4300
    );
  } catch (_error) {
    // Keep search payload when details request fails.
  }

  const summary = normalizeYelpBusinessSummary(detailBusiness);
  if (!summary) {
    return null;
  }

  let reviews = [];
  try {
    const reviewData = await fetchJsonWithTimeout(
      `https://api.yelp.com/v3/businesses/${encodeQuery(firstBusiness.id)}/reviews`,
      { headers: yelpHeaders },
      4300
    );
    reviews = Array.isArray(reviewData?.reviews)
      ? reviewData.reviews.map(normalizeYelpReview).filter(Boolean).slice(0, 3)
      : [];
  } catch (_error) {
    reviews = [];
  }

  const photos = [
    ...summary.photos.map((url, index) => ({
      id: `yelp-${index}-${url.slice(-24)}`,
      provider: "yelp",
      url,
      caption: "Yelp business photo",
    })),
  ];
  if (photos.length === 0 && summary.imageUrl) {
    photos.push({
      id: "yelp-cover",
      provider: "yelp",
      url: summary.imageUrl,
      caption: "Yelp listing photo",
    });
  }

  return {
    provider: "yelp",
    business: summary,
    photos: photos.slice(0, 4),
    reviews,
  };
}

function mergePhotos({ googlePhotos = [], yelpPhotos = [] }) {
  const combined = [...googlePhotos, ...yelpPhotos];
  const seen = new Set();
  const unique = [];
  for (const photo of combined) {
    const key = sanitizeText(photo?.url, 520);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(photo);
    if (unique.length >= 6) {
      break;
    }
  }
  return unique;
}

function mergeReviews({ googleReviews = [], yelpReviews = [] }) {
  return [...googleReviews, ...yelpReviews].slice(0, 6);
}

function buildFallbackPlace({ name, lat, lon }) {
  return {
    name,
    lat,
    lon,
    address: "",
    rating: null,
    reviewCount: null,
    googleMapsUri: buildGoogleMapsFallbackUri({ name, lat, lon }),
    websiteUri: null,
    openNow: null,
    editorialSummary: null,
    priceLevel: null,
    photoRefs: [],
  };
}

async function getPlacePreview({ name, lat, lon }) {
  const safeName = sanitizeText(name, 120);
  const safeLat = normalizeCoordinate(lat);
  const safeLon = normalizeCoordinate(lon);
  if (!safeName || safeLat == null || safeLon == null) {
    return null;
  }

  const [googleResult, yelpResult] = await Promise.all([
    fetchGooglePreview({
      name: safeName,
      lat: safeLat,
      lon: safeLon,
    }).catch(() => null),
    fetchYelpPreview({
      name: safeName,
      lat: safeLat,
      lon: safeLon,
    }).catch(() => null),
  ]);

  const place = googleResult?.place || buildFallbackPlace({ name: safeName, lat: safeLat, lon: safeLon });
  const photos = mergePhotos({
    googlePhotos: googleResult?.photos || [],
    yelpPhotos: yelpResult?.photos || [],
  });
  const reviews = mergeReviews({
    googleReviews: googleResult?.reviews || [],
    yelpReviews: yelpResult?.reviews || [],
  });

  return {
    provider: googleResult ? "google" : yelpResult ? "yelp" : "fallback",
    place,
    photos,
    reviews,
    yelp: yelpResult?.business || null,
    links: {
      googleMaps:
        place.googleMapsUri ||
        buildGoogleMapsFallbackUri({
          name: safeName,
          lat: safeLat,
          lon: safeLon,
        }),
      appleMaps: buildAppleMapsUri({
        name: safeName,
        lat: safeLat,
        lon: safeLon,
      }),
      yelp:
        yelpResult?.business?.url ||
        buildYelpSearchUri({
          name: safeName,
          lat: safeLat,
          lon: safeLon,
        }),
    },
    hasLiveReviews: Boolean(reviews.length),
    hasPhotos: Boolean(photos.length),
  };
}

module.exports = {
  getPlacePreview,
  getGooglePlacesApiKey,
  getYelpApiKey,
};
