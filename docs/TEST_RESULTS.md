# StackPulse audit test results

**Audit date:** 2026-11-25 (local machine clock)
**Scope:** Existing backend, frontend, monitoring integration, reliability modules, optional AI path, and security-relevant runtime behavior. No feature work was intended.

## Executive result

The native monitoring and application logic have passing deterministic tests, and the local HTTP API and frontend smoke tests passed against an isolated temporary database. This is not a production-readiness certification: no authorized external endpoint was supplied, Docker Engine/Gatus were unavailable, and OmniRoute had no listener. Those live requirements are explicitly unverified below.

No existing StackPulse application database was found in `backend/data`. The existing Gatus SQLite database and its WAL/SHM files under `monitoring/data` were left untouched. All live API/browser tests used an isolated temporary SQLite database and disposable credentials; the temporary database was removed after testing.

## Environment and quality checks

- Node.js `v24.15.0`, npm `11.12.1`, Git `2.52.0.windows.1`.
- Docker CLI `29.9.3`, Compose `v5.7.1`; Docker Engine was unavailable because the Docker Desktop Linux engine named pipe did not exist.
- `docker compose config --quiet`: **PASS** (static configuration parsing only; no container was started).
- `cd backend; npm test -- --runInBand`: **PASS**, 7 suites / 49 tests.
- `cd backend; npm run build`: **PASS** (TypeScript compile).
- `cd frontend; npm run build`: **PASS** (TypeScript compile and Vite production build).
- `git diff --cached --check` and `git diff --check`: **PASS**.
- Backend lint: **UNAVAILABLE**; the declared script invokes ESLint, but no ESLint executable is installed in the backend package.
- Frontend lint: **UNAVAILABLE**; ESLint is installed, but no ESLint configuration exists.

## Live API and browser checks

The backend was launched on an isolated temporary SQLite file, then stopped and restarted using that same file.

- `GET /api/health`: **PASS**, returned `ok`; native engine was `available`, while Gatus was `unavailable`.
- First registration and login: **PASS**; first account received the administrator role.
- `GET /api/endpoints` without credentials and with an invalid bearer token: **PASS**, both returned `401`.
- Authenticated endpoint listing and dashboard: **PASS**, returned an empty endpoint list without inventing results.
- `POST /api/endpoints` with `http://127.0.0.1:8080/health`: **PASS**, rejected with `400` and “Private or reserved IP destinations are not allowed.”
- `GET /api/status` with no public endpoints: **PASS**, returned `degraded` and zero endpoints.
- Persistence: **PASS**; the temporary account could log in after restarting the API against the same SQLite file.
- Vite proxy to the loopback-bound API: **PASS**; proxied health, registration, login, and authenticated dashboard requests succeeded.
- Browser login and dashboard, endpoint manager, incident center, notifications, and public status empty state: **PASS**. At a 320-pixel viewport, each page's document width remained 320 pixels. No JavaScript page errors were observed.
- The attempted private endpoint in the UI showed the server's rejection message. The browser logged the expected HTTP 400 resource response; this was the intentional negative SSRF test, not an uncaught JavaScript exception.

## Automated behavior coverage

- Native HTTP monitor tests use a controlled local HTTP fixture (the destination resolver is mocked for fixture access). They cover HTTP 200, HTTP 503, exact expected status, failed expected-content assertion, refused connection, and a 302 response. The redirect case asserts only one request reaches the fixture, so the redirect is not followed.
- URL tests cover loopback, RFC1918, metadata, reserved ports, malformed/non-HTTP URLs, IPv6 local/special ranges, credentials, and special-use IP classification.
- A controlled DNS lookup returning both a public and a private address was injected into `resolveSafeDestination`; it rejected the entire answer set before connection.
- TrustPulse tests cover schedule-derived expected/completed/missing checks, 100% observed uptime with 60% coverage, duplicate slot deduplication, interval changes, pauses, reload exclusions, engine interruption/recovery, pending state, and zero completed checks.
- IncidentLens tests cover HTTP 503, DNS, timeout, refused connection, TLS validation/expiry, functional assertion failures, stale monitoring, and evidence limitations without asserting a root cause.
- Failure Verification tests cover a repeated target failure, simultaneous reference failure, a passing retry, and missing authorized reference configuration. These use controlled test inputs; no third-party reference URL was probed.
- Integration tests cover administrator bootstrap, login, ownership isolation, endpoint create/edit/pause/resume/archive, schedule intervals, public response URL redaction, check deduplication, incident threshold/recovery, notification record counts, and AI sanitization/fallback/cache/rate-limit/timeout behavior.
- Incident tests verify one active incident after repeated failures, an incremented failure count, two simulated notification channels on creation, and two more on recovery. Checks are inserted deterministically into the test database; this does not prove a live scheduled outage cycle.
- A temporary self-signed HTTPS fixture verified that the TLS helper extracts expiration, issuer, and common name. Its certificate was correctly reported as not trusted (`valid: false`); this does not validate a real public certificate chain or the full persisted API path.

## Requirement disposition

**Verified by tests or isolated runtime checks**

- Registration/login, invalid/absent authentication rejection, first-admin bootstrap, endpoint ownership, and admin-only mutations.
- Supported interval editing, pause/resume, soft deletion with retained test history, immutable configuration keys, YAML serialization, and application-level rollback when the verifier fails.
- Native HTTP status/latency result handling, expected-content checks, bounded request behavior, and no-follow redirect behavior in the controlled fixture.
- Schedule-aware TrustPulse math, missing-data distinction, incident rules, simulated notification record deduplication, IncidentLens categories, and AI-disabled fallback.
- Public status remains degraded/unknown with no endpoints; integration tests verify a public endpoint response omits its private URL and failure classification.
- Local persistence across a real API process restart on the isolated test database.

**Partially verified**

- Endpoint configuration and monitoring were exercised by mocked service integration tests, not by a real authorized public endpoint. The audit did not create an endpoint that contacted an external service.
- TLS metadata extraction worked against a temporary self-signed local fixture, but real certificate validity, scheduled TLS worker behavior, and public endpoint API persistence were not observed live.
- The 24-hour history/chart components build and consume persisted result APIs, but no populated chart with real authorized endpoint history was available.
- The backend worker starts independently of the browser and the dashboard identifies it as the native source. A sustained real endpoint check sequence while the browser was closed was not observed.
- SSRF controls were tested with local private-address rejection and injected DNS results. This does not constitute a network-level egress or live DNS-rebinding assessment.

**Not verified**

- Actual Gatus startup/version/image digest, live API response schema, hot reload, add/edit/delete propagation, history persistence across configuration changes/restarts, or Gatus interruption/recovery. The Docker Engine was unavailable; no container was stopped.
- Continuous monitoring, real failure creation/recovery, and real notification timeline against an authorized service under a sustained live schedule.
- Real external email/webhook delivery; the feature intentionally writes simulated records only.
- Production deployment, TLS termination for the StackPulse web/API, OS/container egress filtering, and scale/load behavior.

## Audit changes

- Added a real controlled 302/no-follow assertion to the HTTP monitor tests; the previous test name suggested redirect coverage but only exercised a refused connection.
- Changed the backend listener default from the all-interface IPv6 wildcard to `127.0.0.1`. Runtime observation before the fix showed `::`; after the fix the listener was `127.0.0.1`, and API health remained `ok`. Explicit `HOST` configuration is available for operators who deploy behind suitable network controls.
- No monitoring history, Gatus data, or user credentials were changed.
