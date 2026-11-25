# StackPulse Backend MVP API

Base URL: `http://localhost:3001/api`

Successful responses use `{ "data": ... }`; errors use `{ "error": { "code": "...", "message": "..." } }`. Login retains top-level `token` and `user` fields for the existing frontend and also includes the same values under `data`.

## Initial setup and authorization

1. Copy `backend/.env.example` to `backend/.env`; set `JWT_SECRET` and a temporary `ADMIN_BOOTSTRAP_TOKEN` to unique random values of at least 32 characters.
2. Start the backend. No default administrator or password is seeded.
3. Register the first user using `POST /auth/register` and the configured bootstrap token. The first account becomes the administrator; later registrations receive the `user` role without the token.
4. Only administrators can create, edit, pause, resume, or archive endpoints. Endpoint reads are scoped to the authenticated owner. Requests use `Authorization: Bearer <token>`.
5. Remove `ADMIN_BOOTSTRAP_TOKEN` from the process environment after first registration.

Registration and login are rate limited. Passwords require at least 12 characters on registration and are hashed using bcrypt. Tokens are HS256 JWTs with a 12-hour expiration and validated issuer/audience.

## Authentication

### `POST /auth/register`

```json
{
  "email": "admin@example.test",
  "password": "<12+ character password>",
  "bootstrapToken": "<configured first-admin bootstrap token>"
}
```

The bootstrap token is required only while the user table is empty. Returns `201`; duplicate email returns `409`.

### `POST /auth/login`

Accepts the same credentials. Invalid credentials return `401`.

## Health and dashboard

### `GET /health`

Returns API status, runtime details, and Gatus/native monitoring engine status. Gatus being unavailable does not make the API unhealthy; native checks remain authoritative.

### `GET /dashboard`

Requires authentication; returns only the caller's endpoints, active incidents, recent notifications, and monitoring-engine status. Each endpoint includes `trustPulse`, `incidentLens`, and `latestVerification`.

## Endpoints

All endpoint routes require a bearer token. Mutations require the administrator role.

### `GET /endpoints`

Lists the caller's endpoints.

### `POST /endpoints`

```json
{
  "name": "Authorized test endpoint",
  "url": "https://approved.example.test/health",
  "expected_status": 200,
  "interval_seconds": 30,
  "is_public": true
}
```

`interval_seconds` must be `30`, `60`, or `120`. The optional `is_public` creates an unguessable public status slug. URL validation rejects credentials and non-HTTP(S) protocols, resolves every DNS answer, rejects non-global addresses, and pins the resolved destination address for each native request. Redirects are not followed. Endpoint creation immediately runs a native check and returns that result.

`expected_status` is an optional exact HTTP status (100–599), defaulting to `200`. The native monitor treats a response with any other status as a failure.

The optional `expected_content` field (maximum 512 characters) requires the response body for the expected status to contain the configured substring. The body is bounded by the native monitor's response-size limit; no Gatus assertion support is claimed because Gatus runtime configuration remains unverified.

### `GET /endpoints/:id`

Returns endpoint details, last check, TLS metadata (or explicit `unavailable`), active schedule, TrustPulse metrics, IncidentLens diagnosis, and the latest failure-verification result.

TrustPulse includes schedule-aware expected, completed, successful, failed, missing, and excluded check counts; observed uptime and monitoring coverage; freshness and engine state; last successful/completed check times; and monitoring interruptions. Failed counts include completed failures only; missing checks remain separate. Uptime is `null` when no scheduled result completed. A 100% observed uptime is not evidence of uninterrupted availability. Engine unavailability or missing data never changes the last known service state or resolves an incident.

IncidentLens includes observed evidence, a deterministic failure category, possible causes, recommended troubleshooting, and evidence limitations. It does not assert an exact root cause.

### `GET /endpoints`

Returns the caller's endpoints with each endpoint's latest check, TrustPulse snapshot, IncidentLens diagnosis, and latest verification result.

### `PATCH /endpoints/:id`

Accepts any non-empty subset of `name`, `url`, `expected_status`, `expected_content`, `interval_seconds`, `group_name`, and `is_public`. URL or interval changes create a new schedule-history record. Gatus keys are derived once from the immutable endpoint UUID and do not change with the endpoint display name.

### `DELETE /endpoints/:id`

Soft-archives the endpoint and closes its active schedule. Check and incident history are retained.

### `POST /endpoints/:id/pause` and `POST /endpoints/:id/resume`

Pause closes the active schedule; resume opens a new schedule-history row.

### `GET /endpoints/:id/checks?limit=100`

Returns up to 3,000 persisted health checks, newest first. Each result includes a scheduled-check identifier, status/latency when available, timestamp, success, failure classification, TLS expiry when available, and source. Unique scheduled-check IDs prevent repeated scheduler/API attempts from duplicating a result.

### `POST /endpoints/:id/verify`

Administrator-authenticated and rate-limited to three requests per minute. Performs at most one bounded retry of the latest failed scheduled check; if the retry also fails and an operator-authorized reference URL is configured, it makes one bounded reference request. This action is also subject to a per-endpoint 30-second cooldown and process-wide concurrency limit. Verification records are persisted separately and never count as scheduled checks, uptime, or coverage. Outcomes are `verified_endpoint_failure`, `possible_monitoring_network_failure`, `not_reproduced`, `unverified`, or `not_needed`; no outcome claims a global outage.

Set `TRUSTPULSE_REFERENCE_URL` in the backend environment only to a destination the operator is authorized to probe. It is optional and receives the same URL, DNS, destination-pinning, timeout, response-size, and redirect protections as monitored endpoints. Without it, a failed retry remains unverified.

## Incidents and notifications

### `GET /incidents` and `GET /incidents/:id`

Return the caller's incidents and, for detail, a chronological event timeline. Three consecutive failed scheduled checks open one incident. Further failures update that incident; a successful scheduled check resolves it. Missing data does not resolve incidents.

### `GET /notifications`

Returns the caller's simulated email and webhook notification records. Incident creation and recovery each produce at most one record per channel. No external delivery is attempted.

## Public status

### `GET /public/status/:slug`

Returns public summary only for an enabled endpoint explicitly made public by an administrator. The response omits the endpoint URL, owner, and private configuration and includes a 24-hour history containing only timestamps, success, HTTP status, and latency. It does not expose failure details or failure classifications. Stale or unavailable monitoring is reported as `unknown`; the last known state remains separately available. TLS expiry is `null` with `status: "unavailable"` when it could not be inspected.

## Monitoring and Gatus limitations

The native Node.js worker is the source of truth. It enforces connect-time DNS pinning, 8-second HTTP timeouts, a 64 KiB response limit, no redirects, and a process-wide concurrency cap. Certificate inspection is bounded and uses the same destination validation.

Expected checks are derived from endpoint schedule history, with changes, pauses, and declared native configuration reload windows accounted for. Result-to-schedule matching tolerates small scheduling drift and deduplicates results mapped to the same slot. Missing slots reduce monitoring coverage but are not classified as service failures.

Gatus remains an optional internal engine. Dynamic Gatus configuration is disabled by default because engine egress policy and hot reload were not verified. If explicitly enabled, only public IP-literal destinations are emitted, YAML is generated with a YAML library, writes are serialized and atomic, and an update is rolled back if fresh per-endpoint results do not confirm application. See [GATUS_VALIDATION.md](./GATUS_VALIDATION.md).
