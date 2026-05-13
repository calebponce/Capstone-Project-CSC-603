// Each interest declares the OSM tag selectors that produce sensible POIs.
// Selectors are `{ key, value }` pairs that map directly to Overpass queries.
// `categoryLabel` lets us show human-readable labels in the UI for any tag we surface.
const INTEREST_CONFIG = {
  food: {
    label: "Food",
    selectors: [
      { key: "amenity", value: "restaurant" },
      { key: "amenity", value: "cafe" },
      { key: "amenity", value: "fast_food" },
      { key: "amenity", value: "food_court" },
      { key: "amenity", value: "bar" },
      { key: "amenity", value: "biergarten" },
      { key: "amenity", value: "pub" },
    ],
  },
  culture: {
    label: "Culture",
    selectors: [
      { key: "tourism", value: "museum" },
      { key: "tourism", value: "gallery" },
      { key: "amenity", value: "arts_centre" },
      { key: "amenity", value: "theatre" },
      { key: "amenity", value: "cinema" },
      { key: "historic", value: "monument" },
      { key: "historic", value: "memorial" },
      { key: "historic", value: "castle" },
      { key: "historic", value: "ruins" },
    ],
  },
  sightseeing: {
    label: "Sightseeing",
    selectors: [
      { key: "tourism", value: "attraction" },
      { key: "tourism", value: "viewpoint" },
      { key: "tourism", value: "artwork" },
      { key: "tourism", value: "theme_park" },
      { key: "tourism", value: "zoo" },
      { key: "tourism", value: "aquarium" },
      { key: "historic", value: "monument" },
      { key: "historic", value: "memorial" },
    ],
  },
  outdoors: {
    label: "Outdoors",
    selectors: [
      { key: "natural", value: "beach" },
      { key: "leisure", value: "park" },
      { key: "leisure", value: "nature_reserve" },
      { key: "leisure", value: "garden" },
      { key: "tourism", value: "viewpoint" },
      { key: "tourism", value: "picnic_site" },
      { key: "boundary", value: "national_park", element: "relation" },
      { key: "boundary", value: "protected_area", element: "relation" },
      { key: "route", value: "hiking", element: "relation" },
    ],
  },
  shopping: {
    label: "Shopping",
    selectors: [
      { key: "shop", value: "mall" },
      { key: "shop", value: "department_store" },
      { key: "shop", value: "supermarket" },
      { key: "shop", value: "marketplace" },
      { key: "shop", value: "gift" },
      { key: "shop", value: "books" },
      { key: "amenity", value: "marketplace" },
    ],
  },
};

// OSM categories we never want to surface even if a broader selector would catch them.
const POI_DENYLIST_CATEGORIES = new Set([
  "playground",
  "fitness_station",
  "fast_food", // surfaces only when food is selected; otherwise treat as low-signal
  "parking",
  "fuel",
  "atm",
  "bank",
  "bench",
  "toilets",
]);

// Human-readable labels for OSM category strings we expose to the UI.
const CATEGORY_LABEL_OVERRIDES = {
  beach: "Beach",
  peak: "Peak",
  cliff: "Cliff",
  viewpoint: "Viewpoint",
  nature_reserve: "Nature reserve",
  garden: "Garden",
  dog_park: "Dog park",
  park: "Park",
  picnic_site: "Picnic site",
  museum: "Museum",
  gallery: "Gallery",
  arts_centre: "Arts centre",
  theatre: "Theatre",
  cinema: "Cinema",
  monument: "Monument",
  memorial: "Memorial",
  castle: "Castle",
  ruins: "Historic ruins",
  attraction: "Attraction",
  artwork: "Artwork",
  theme_park: "Theme park",
  zoo: "Zoo",
  aquarium: "Aquarium",
  hiking: "Hiking route",
  restaurant: "Restaurant",
  cafe: "Café",
  fast_food: "Fast food",
  food_court: "Food court",
  bar: "Bar",
  biergarten: "Beer garden",
  pub: "Pub",
  mall: "Shopping mall",
  department_store: "Department store",
  supermarket: "Supermarket",
  marketplace: "Marketplace",
  gift: "Gift shop",
  books: "Bookstore",
};

const AIRPORTS = [
  {
    code: "LAX",
    name: "Los Angeles International Airport",
    city: "Los Angeles",
    lat: 33.9416,
    lon: -118.4085,
    searchRadiusMeters: 14000,
    defaultTransportMode: "driving",
    processingMinutes: {
      domestic: 35,
      international: 60,
    },
    returnBufferMinutes: {
      domestic: 90,
      international: 150,
    },
    recommendedTripMinutes: {
      domestic: 75,
      international: 60,
    },
    maxTravelMinutesOneWay: {
      domestic: 30,
      international: 20,
    },
  },
  {
    code: "SFO",
    name: "San Francisco International Airport",
    city: "San Francisco",
    lat: 37.6213,
    lon: -122.379,
    searchRadiusMeters: 16000,
    defaultTransportMode: "driving",
    processingMinutes: {
      domestic: 30,
      international: 55,
    },
    returnBufferMinutes: {
      domestic: 85,
      international: 140,
    },
    recommendedTripMinutes: {
      domestic: 80,
      international: 60,
    },
    maxTravelMinutesOneWay: {
      domestic: 28,
      international: 18,
    },
  },
  {
    code: "JFK",
    name: "John F. Kennedy International Airport",
    city: "New York City",
    lat: 40.6413,
    lon: -73.7781,
    searchRadiusMeters: 14000,
    defaultTransportMode: "driving",
    processingMinutes: {
      domestic: 40,
      international: 65,
    },
    returnBufferMinutes: {
      domestic: 95,
      international: 155,
    },
    recommendedTripMinutes: {
      domestic: 75,
      international: 55,
    },
    maxTravelMinutesOneWay: {
      domestic: 30,
      international: 18,
    },
  },
];

function getAirportConfig(code) {
  return AIRPORTS.find((airport) => airport.code === code);
}

function getCategoryLabel(category) {
  if (!category) return "Point of interest";
  const key = String(category).trim().toLowerCase();
  if (CATEGORY_LABEL_OVERRIDES[key]) return CATEGORY_LABEL_OVERRIDES[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = {
  AIRPORTS,
  INTEREST_CONFIG,
  POI_DENYLIST_CATEGORIES,
  CATEGORY_LABEL_OVERRIDES,
  getAirportConfig,
  getCategoryLabel,
};
