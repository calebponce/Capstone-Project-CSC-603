const INTEREST_CONFIG = {
  food: {
    label: "Food",
    tags: ["restaurant", "cafe", "fast_food", "food_court", "bar"],
  },
  culture: {
    label: "Culture",
    tags: ["museum", "gallery", "arts_centre", "theatre", "library"],
  },
  sightseeing: {
    label: "Sightseeing",
    tags: ["attraction", "viewpoint", "park", "beach", "monument"],
  },
  shopping: {
    label: "Shopping",
    tags: ["mall", "department_store", "supermarket", "marketplace", "gift"],
  },
};

const AIRPORTS = [
  {
    code: "LAX",
    name: "Los Angeles International Airport",
    city: "Los Angeles",
    lat: 33.9416,
    lon: -118.4085,
    searchRadiusMeters: 12000,
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
    searchRadiusMeters: 10000,
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
    searchRadiusMeters: 12000,
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

module.exports = {
  AIRPORTS,
  INTEREST_CONFIG,
  getAirportConfig,
};
