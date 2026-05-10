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

### `POST /api/plan`
Builds a layover itinerary with feasibility, AI-generated wording, schedule, and map candidates.

Request body:

```json
{
  "airportCode": "SFO",
  "arrivalTime": "2026-04-14T14:30",
  "departureTime": "2026-04-14T20:30",
  "connectionType": "domestic",
  "interests": ["food", "culture"]
}
```

Validation rules:

- `airportCode`, `departureTime`, and `connectionType` are required.
- `arrivalTime` is optional; if omitted, the server uses current time.
- If provided, `arrivalTime` must be valid and strictly before `departureTime`.
- `airportCode` must be one of the supported airport codes.
- `connectionType` must be `domestic` or `international`.
- `departureTime` must parse as a valid date and be in the future.
- `interests` is optional; invalid values are ignored.

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
