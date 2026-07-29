# Weather & Travel Assistant

## Architecture

Weather and route facts are calculated by the API. Open-Meteo supplies normalized
hourly forecasts and Geoapify supplies route estimates. If routing is unavailable,
the user may opt into a clearly identified low-confidence Haversine/speed fallback.
AI is optional and can only polish a deterministic message; numeric facts are
validated before a polished message is accepted.

A single NestJS worker scans the configured look-ahead horizon. A PostgreSQL
advisory lock prevents multiple Railway replicas from processing the same scan.
Notification fingerprints and a database uniqueness constraint provide a second
idempotency boundary. Task and subtask lifecycle changes invalidate pending
records.

Delivery uses a hybrid model:

- The API persists and delivers an in-app notification at the due time.
- Registered Expo devices receive a backend push when a valid enabled token exists.
- Mobile synchronizes upcoming payloads and schedules local notifications ahead of
  time, then acknowledges scheduling or delivery.

Local scheduling remains available if push credentials or tokens are absent, but
the device must have synchronized while authenticated before the notification
time. Delivery is never represented as guaranteed when the operating system has
revoked notification permission.

## Configuration

Required production configuration:

```text
WEATHER_PROVIDER=open-meteo
WEATHER_API_BASE_URL=https://api.open-meteo.com
WEATHER_REQUEST_TIMEOUT_MS=8000
WEATHER_CACHE_TTL_MINUTES=20
GEOAPIFY_API_KEY=<server-only key>
GEOAPIFY_ROUTING_BASE_URL=https://api.geoapify.com
ROUTING_REQUEST_TIMEOUT_MS=8000
WEATHER_WORKER_INTERVAL_MINUTES=10
WEATHER_LOOKAHEAD_HOURS=48
```

Optional AI polishing uses the existing OpenRouter/Qwen API configuration. Weather
and travel advice continues deterministically when AI is unavailable.

## Deployment

Apply `drizzle/0012_weather_travel_assistant.sql` to the target Supabase/Postgres
database before deploying the API. Configure the variables above only on the
Railway API/worker service. Do not add provider keys to Vite or Expo environment
variables.

The worker runs inside the API process and is safe across replicas because it uses
an advisory lock. A separate Railway cron per task is neither required nor
supported.

## Operational limitations

- Public transport routing is intentionally unavailable until a reliable provider
  profile is configured.
- Forecasts outside the Open-Meteo horizon remain pending and are reevaluated by
  later worker scans.
- Geoapify fallback duration is approximate and always labeled low confidence.
- Mobile local delivery depends on a prior authenticated sync; backend push depends
  on a valid registered Expo token.
- Planner acceptance rejects impossible consecutive destination schedules and
  returns structured conflicts; it does not add a visible travel block to the
  calendar timeline.
