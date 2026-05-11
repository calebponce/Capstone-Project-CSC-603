# API Structure (Current Implementation)

Base URL: `http://localhost:3000`

## Endpoints

### `GET /api/health`
Connectivity and service metadata for frontend health checks.

Response:

```json
{
  "status": "ok",
  "name": "layoverplus",
  "version": "1.0.0",
  "timestamp": "2026-04-14T21:00:00.000Z",
  "uptimeSeconds": 128
}
```

### `GET /api/config`
Returns static airport and interest configuration.

Response shape:

```json
{
  "meta": {
    "generatedAt": "2026-04-14T21:00:00.000Z",
    "apiVersion": "1.0.0"
  },
  "airports": [],
  "interests": {}
}
```

### `GET /api/usage`
Returns in-memory API usage counters and recent `/api/plan` timing status.

Response shape:

```json
{
  "meta": {
    "generatedAt": "2026-04-14T21:00:00.000Z",
    "apiVersion": "1.0.0",
    "uptimeSeconds": 128
  },
  "totals": {
    "allApiRequests": 16,
    "healthChecks": 8,
    "configLoads": 2,
    "usageViews": 2,
    "planRequests": 4,
    "planErrors": 1
  },
  "planLatency": {
    "averageMs": 820,
    "lastMs": 710
  },
  "lastPlan": {
    "status": "success",
    "at": "2026-04-14T21:00:00.000Z",
      "error": null
  }
}
```

Also includes:

- `mapsRuntime` cache/retry stats from POI and routing calls
- `feedbackSampleSize` and `eventSampleSize`

### `POST /api/event`
Best-effort frontend product event ingestion.

Request body:

```json
{
  "eventType": "plan_submit",
  "stage": "planner",
  "sessionKey": "optional",
  "details": {}
}
```

Response:

```json
{
  "ok": true,
  "recordedAt": "2026-04-14T21:00:00.000Z"
}
```

### `POST /api/feedback`
Stores a 1-5 contribution/rating signal for generated plans.

Request body:

```json
{
  "score": 4,
  "sentiment": "positive",
  "comment": "Timeline was clear.",
  "sessionKey": "optional",
  "airportCode": "SFO",
  "riskLabel": "Low"
}
```

Response:

```json
{
  "ok": true,
  "recordedAt": "2026-04-14T21:00:00.000Z"
}
```

### `POST /api/flight-status`
Returns simulated flight context and replan hints tied to the current layover request.

Request body:

```json
{
  "airportCode": "SFO",
  "arrivalTime": "2026-04-14T14:30",
  "departureTime": "2026-04-14T20:30",
  "connectionType": "domestic",
  "airlineCode": "AA",
  "flightNumber": "1234",
  "sessionKey": "optional"
}
```

Response shape:

```json
{
  "meta": {},
  "sessionKey": "SFO|domestic|...",
  "flight": {
    "provider": "simulated",
    "statusCode": "on-time",
    "statusLabel": "On time",
    "terminal": "A",
    "gate": "A24",
    "delayMinutes": 0,
    "boardingSoon": false,
    "minutesToDeparture": 178,
    "events": [],
    "replan": {
      "trigger": "none",
      "recommended": false,
      "reason": "string",
      "suggestedDepartureTime": "2026-04-14T20:30:00.000Z"
    }
  },
  "replanHistory": []
}
```

### `GET /api/replan-history?sessionKey=...&limit=12`
Returns the latest replan signals for a session key.

### `POST /api/plan`
Builds a layover itinerary with feasibility, AI-generated wording, schedule, and map candidates.

Request body:

```json
{
  "airportCode": "SFO",
  "arrivalTime": "2026-04-14T14:30",
  "departureTime": "2026-04-14T20:30",
  "connectionType": "domestic",
  "riskProfile": "balanced",
  "strategyPack": "standard",
  "interests": ["food", "culture"],
  "airlineCode": "AA",
  "flightNumber": "1234",
  "trustAcknowledged": true,
  "sessionKey": "optional-session-key"
}
```

Validation rules:

- `airportCode`, `arrivalTime`, `departureTime`, and `connectionType` are required.
- `arrivalTime` must be valid and strictly before `departureTime`.
- `airportCode` must be one of the supported airport codes.
- `connectionType` must be `domestic` or `international`.
- `departureTime` must parse as a valid date and be in the future.
- `interests` is optional; invalid values are ignored.
- `riskProfile` is optional and normalized to `conservative`, `balanced`, or `explorer`.
- `strategyPack` is optional and normalized to `standard`, `food-first`, `culture-deep`, or `recharge`.
- `trustAcknowledged` must be `true`.
- `airlineCode` and `flightNumber` are optional ticket-context fields used by frontend lookup links.

Success response:

```json
{
  "meta": {
    "generatedAt": "2026-04-14T21:00:00.000Z",
    "apiVersion": "1.0.0"
  },
  "request": {},
  "airport": {},
  "feasibility": {},
  "summary": {},
  "session": {
    "key": "SFO|domestic|...",
    "riskProfile": "balanced",
    "strategyPack": "standard",
    "trustAcknowledged": true
  },
  "schedule": [
    {
      "label": "string",
      "start": "2:15 PM",
      "end": "2:45 PM",
      "minutes": 30,
      "location": "string",
      "reason": "Optional AI-generated explanation"
    }
  ],
  "narrative": "string",
  "ai": {
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "used": true,
    "title": "string",
    "travelerTips": [],
    "error": null
  },
  "explainability": {},
  "flight": {},
  "replanHistory": [],
  "observability": {
    "generatedInMs": 733,
    "mapsRuntime": {}
  },
  "map": {}
}
```

If `OPENAI_API_KEY` is not configured or the OpenAI request fails, `ai.used` is `false`, `ai.provider` is `fallback`, and the deterministic fallback schedule/narrative are returned.

## Error Contract

For all API routes, errors follow:

```json
{
  "error": "Message",
  "details": "Optional details"
}
```

Unknown API routes return `404` with:

```json
{
  "error": "API route not found."
}
```
