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
Builds a layover itinerary with feasibility, schedule, and map candidates.

Request body:

```json
{
  "airportCode": "SFO",
  "departureTime": "2026-04-14T20:30",
  "connectionType": "domestic",
  "interests": ["food", "culture"]
}
```

Validation rules:

- `airportCode`, `departureTime`, and `connectionType` are required.
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
  "schedule": [],
  "narrative": "string",
  "map": {}
}
```

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
