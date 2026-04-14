# LayoverPlus

LayoverPlus is a web application that turns an airport layover into a safe, time-bounded micro-itinerary.

This implementation covers the first three project weeks:

- Week 1: finalized scope, selected airports (`LAX`, `SFO`, `JFK`), and defined feasibility rules plus safety buffers
- Week 2: project setup, backend skeleton, and live maps/POI data integration
- Week 3: feasibility calculator, POI retrieval, itinerary structure, grounded narrative generation, and map-based results

## Features

- Inputs for airport, departure time, connection type, and interests
- Airport-specific processing assumptions and return safety buffers
- Feasibility scoring with `Low`, `Medium`, and `High` risk labels
- Nearby POI search using OpenStreetMap Overpass
- Travel time estimates using OSRM routing
- Structured itinerary blocks with timestamps
- Grounded narrative summary derived from the computed plan
- Browser map view using Leaflet

## Selected Airports

- `LAX` - Los Angeles International Airport
- `SFO` - San Francisco International Airport
- `JFK` - John F. Kennedy International Airport

## Run

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open:

```text
http://localhost:3000
```

## API

- `GET /api/config`
- `POST /api/plan`

Example payload:

```json
{
  "airportCode": "SFO",
  "departureTime": "2026-04-14T20:30",
  "connectionType": "domestic",
  "interests": ["food", "culture"]
}
```

## Notes

- The app uses live public map services at runtime:
  - Overpass API for POI discovery
  - OSRM for route duration estimates
- If a live route estimate is unavailable, the backend falls back to a conservative distance-based estimate.
- The generative itinerary text is grounded in the structured result returned by the backend.
