# StackPulse Phase 1 Final Regression and Baseline Acceptance

**Date:** 2026-11-26
**Scope:** Phases 1.1 through 1.6
**Verdict:** CONDITIONAL PASS - local development baseline

## Executive summary

StackPulse is compilable, testable and usable for isolated local development. The native Node.js monitoring worker, SQLite persistence, authentication, endpoint ownership checks, deterministic IncidentLens, TrustPulse calculations and public status page were exercised successfully. A live authorized HTTPS endpoint returned HTTP 200, was represented in the dashboard and endpoint detail, produced latency samples and TLS metadata, survived a backend restart and appeared on the public status page.

The baseline is not certified for public production use. Remaining P0/P1 issues include incomplete multi-user endpoint ownership semantics, persistent worker supervision and deployment requirements, and the lack of a live wall-clock failure-to-recovery result because the candidate external 503 service was rejected by existing SSRF controls.

Generative AI is removed. Gatus is optional and Docker is not required for normal native operation.

## Actual architecture

- React 18 and Vite 5 frontend with TypeScript.
- Express and Node.js backend with TypeScript.
- better-sqlite3 SQLite database.
- Native Node.js HTTP/HTTPS worker as authoritative monitoring engine.
- Native TLS certificate inspection.
- Zod request validation.
- JWT bearer authentication and bcrypt password hashing.
- Deterministic IncidentLens evidence and troubleshooting rules.
- TrustPulse schedule-aware coverage and freshness.
- Simulated notifications; no external delivery integration.
- Polling-based frontend updates at 15-second intervals.
- Optional Gatus components remain disabled by default.

The frontend uses `/api` and the Vite proxy in development. Protected operations require bearer authentication. Endpoint mutation routes require the administrator role. Public status routes do not expose private URLs or credentials.

## Technology inventory

| Technology | Current status |
|---|---|
| React + Vite | Installed and functionally implemented |
| TypeScript | Installed and used in backend and frontend |
| Tailwind CSS | Installed and implemented |
| shadcn/ui patterns/Radix | Radix primitives installed; the project uses existing shared UI components rather than a complete shadcn dependency wrapper |
| Recharts | Installed and used for latency/history views |
| Lucide React | Installed and used |
| Express | Installed and functionally implemented |
| SQLite/better-sqlite3 | Installed and functionally implemented |
| Zod | Installed and used for API validation |
| JWT | Installed and functionally implemented |
| bcryptjs | Installed and functionally implemented |
| node-cron | Not installed; interval checks use native `setInterval` workers |
| Undici | Not installed; native Node.js HTTP/HTTPS APIs are used |
| Gatus | Optional source/config integration present; runtime disabled/not required |
| Docker Compose | Present in repository, not required for native operation |
| OmniRoute/Ollama | Removed; no executable integration or dependencies remain |
| PostgreSQL/Prisma/BullMQ/Redis/Socket.IO/Motion/Framer Motion | Not implemented |

## Before-and-after test counts

| Stage | Backend tests |
|---|---:|
| Phase 1.1 reproduced initial baseline | 49 passing / 7 suites |
| Phase 1.1 post-generative-AI removal | 48 passing / 7 suites |
| Phase 1.2 | 51 passing / 7 suites |
| Phase 1.3 and later | 56 passing / 7 suites |
| Phase 1.6 final run | 56 passing / 7 suites |

The Phase 1.1 count decreased by one because an AI-specific integration test was removed. Monitoring, TrustPulse and deterministic IncidentLens tests were preserved and the suite grew to 56 tests.

## Build results

Executed in Phase 1.6:

- Backend Jest: 7 suites passed, 56 tests passed.
- Backend `npm run build`: passed.
- Frontend `npm run build`: passed with 2188 transformed modules.
- `git diff --check`: passed.
- Backend lint and frontend lint remain unavailable or incomplete; no ESLint configuration/dependency baseline was provided for backend linting and earlier lint runs could not complete.

## Runtime verification

### Process startup

- Backend startup on `127.0.0.1:3001` succeeded with an isolated temporary SQLite database.
- Startup migrations completed repeatedly.
- Native monitoring worker reported available.
- Gatus reported disabled/unavailable.
- Frontend Vite startup on `127.0.0.1:5173` succeeded.
- Backend restart in the same temporary database returned HTTP login success and preserved the one live endpoint.
- Repeated database migrations and restart persistence were successful.

### Authentication and authorization

Actual API results:

- Health endpoint: 200.
- Invalid registration: 400 `VALIDATION_FAILED`.
- Invalid login: 401 `INVALID_CREDENTIALS`.
- Invalid bearer: 401.
- Expired bearer: 401.
- Protected dashboard without JWT: 401.
- Administrator login: successful.
- Ordinary-user registration: successful.
- Ordinary-user endpoint creation: 403 `FORBIDDEN`.
- Ordinary user accessing an administrator-owned endpoint: 404 `NOT_FOUND`.
- No cross-owner data leak was confirmed.

### Browser workflows

Verified in the integrated browser:

- Administrator login and dashboard rendering.
- Empty database states.
- Live polling.
- Pause and resume of a real endpoint.
- Endpoint detail and latency chart.
- Real TLS certificate metadata.
- Deterministic IncidentLens rendering.
- Public status page.
- Public/private exposure distinction.
- Dark/light theme controls.
- Backend-outage error behavior rather than fabricated data.

Ordinary-user dashboard and endpoint pages were verified previously and no administrator-only “Add endpoint” action was displayed to the ordinary account.

Deletion confirmation, a browser-driven failure-to-recovery sequence, an automated console-error report and automated unmount cleanup instrumentation remain incomplete.

### Responsive verification

The public status page was measured at:

- 360 x 800: no horizontal overflow.
- 390 x 844: no horizontal overflow.
- 768 x 1024: no horizontal overflow.
- 1280 x 720: no horizontal overflow.
- 1920 x 1080: no horizontal overflow.

The requested private application viewports were not separately instrumented at all dimensions. Earlier Phase 1.5 noted a narrow viewport clipping concern, but no source fix was made without a reproducible overflow measurement.

## Monitoring evidence

### Live external monitoring

An isolated temporary database was used to create `https://example.com/` with expected status 200. The real native monitor produced:

- HTTP status: 200.
- Initial measured latency: 3555 ms.
- Subsequent browser measurement: 678 ms.
- Observed uptime: 100%.
- TLS certificate: available, common name `example.com`, expiry 2027-02-23.
- Monitoring history: persisted latency samples.

Pause and resume were verified in the browser. The paused row changed to `Paused`; resume restored `Operational` and later showed coverage degraded due to missing paused/expected periods.

### External 503 attempt

`https://httpstat.us/503` was attempted as a live external 503 fixture. Existing SSRF validation rejected it because DNS resolution returned private/reserved addresses. No SSRF control was weakened.

Therefore, a live wall-clock 503-outage-to-recovery cycle is **BLOCKED**, not passed. The deterministic integration test suite verified the outage/recovery state transitions, but external live evidence is absent.

## Healthy/failure/recovery and incident evidence

Tests verify:

- Controlled HTTP 200, 503, 404 and content mismatch results.
- Three consecutive failures open exactly one incident.
- Further failures update the same incident.
- A successful check resolves that incident.
- Incorrect expected content is `functional_assertion`.
- Request timeout produces `timeout`.
- Pause/resume schedule behavior.
- Scheduled-check deduplication.
- Failure verification remains outside scheduled health-check and coverage counts.

This is deterministic test evidence. A live browser-driven outage/recovery cycle is unresolved.

## TrustPulse validation

Required formulas are implemented as independent metrics:

- Observed uptime = successful completed scheduled checks / completed scheduled checks.
- Coverage = completed scheduled checks / expected scheduled checks.

Previously validated deterministic scenarios:

| Scenario | Observed uptime | Coverage |
|---|---:|---:|
| A: 10/10 completed, 10 successful | 100% | 100% |
| B: 6/10 completed, 6 successful | 100% | 60% |
| C: 8/10 completed, 6 successful | 75% | 80% |
| D: 0 completed | unavailable/null | 0% |

Paused periods do not inflate expected checks. Interval changes use schedule-history rows. UTC-offset timestamp boundaries were corrected and covered by regression tests. Worker interruptions preserve the last service state and expose engine unavailable/stale freshness. Missing checks do not resolve incidents.

The same-host design limitation remains: if the entire StackPulse host fails, this process cannot independently report that failure.

## IncidentLens validation

`incidentlens.service.ts` remains deterministic. It provides evidence, possible causes, limitations and troubleshooting recommendations with `rootCause: null`. A live endpoint detail showed `No Current Failure`, insufficient confidence and explicit evidence limitations. No generative AI explanation control or route was present.

## Security findings

Verified protections:

- JWT HS256 validation, issuer, audience and subject/identity checks.
- bcrypt password verification.
- Unauthorized and invalid/expired JWT rejection.
- Administrator-only endpoint mutation.
- Ordinary users cannot access administrator-owned endpoint details.
- HTTP/HTTPS-only URLs.
- Username/password rejection in URLs.
- Localhost, `.local`, `.internal`, metadata and private/reserved IP rejection.
- DNS answers are checked before the pinned destination request.
- Destination IP is pinned for the TCP connection.
- Redirect following is disabled.
- Bounded response size and eight-second request timeout.
- Public status output excludes private URLs and diagnostics.

No confirmed cross-user data leak or SSRF bypass was found in the executed tests.

### Security limitations

- Regular registered users cannot yet own and manage independent endpoint sets.
- Endpoint mutations are administrator-only, so multi-user service isolation is incomplete.
- SQLite single-host persistence has no external backup/HA strategy.
- JWT secrets and CORS must be production-configured.
- CORS and Helmet are present but production reverse proxy/TLS are not documented and verified.
- Simulated notification records are not real email, Telegram or Discord delivery.
- The native worker and database share a failure domain with the backend host.
- A live TLS certificate check passed against example.com, but expiry alert delivery is not implemented as a user notification channel.

## Bugs discovered and fixed

1. UTC-offset timestamp boundaries in TrustPulse were fixed by numeric `Date.parse` comparisons.
2. Endpoint edit form now initializes from the selected endpoint on dialog open/change.
3. The dashboard no longer advertises an Add Endpoint action to ordinary users.

No confirmed SQL injection, SSRF, redirect or cross-user data leak was found.

## AI removal

No executable OmniRoute, Ollama, OpenAI, incident-explanation route, AI button or AI package dependency was found outside historical Phase 1.1 documentation. Shared HTTP dependencies remain for monitoring/API use.

Gatus and Docker:

- Normal operation succeeds with Gatus disabled.
- Docker was not used or required in the Phase 1.6 runtime validation.

## Files modified

This phase modified and added:

- [PHASE_1_FINAL_REPORT.md](E:/StackPulse/docs/PHASE_1_FINAL_REPORT.md)

The existing Phase 1.5 report is [PHASE_1_5_FRONTEND_VALIDATION.md](E:/StackPulse/docs/PHASE_1_5_FRONTEND_VALIDATION.md).

No source code was changed during Phase 1.6. Existing user changes were preserved.

## Remaining technical debt

### P0

None confirmed in executed local tests.

### P1

1. Complete multiple-user endpoint ownership and isolation; ordinary registered users should manage only their own services.
2. Add persistent worker supervision and recovery independent of the Express process lifecycle.
3. Execute live wall-clock HTTP 503 outage and successful recovery with an authorized local/test fixture.
4. Complete browser delete confirmation and failure/recovery/notification workflows.
5. Implement real notification delivery before production use.
6. Complete expired authentication and unmount/polling instrumentation in browser automation.

### P2

1. Responsive viewport browser automation needs full private-app coverage and a screenshot archive.
2. Backend lint and frontend lint configuration remain incomplete.
3. Existing local `.env` placeholder JWT configuration is unsuitable as-is; startup requires process-safe secret generation.
4. Production TLS, reverse proxy and database backup procedures are not verified.
5. Live worker interruption and process restart should be re-run on a persistent, supervised host.

### P3

1. Responsive website redesign and further mobile usability.
2. Socket.IO only if justified by latency/UX requirements.
3. PDF and CSV reports.
4. Capacitor Android application and native push notifications.
5. Real Telegram and Discord integrations.
6. Local/public deployment automation and zero-cost hosted monitoring options.

## External integration blockers

- Docker Engine was unavailable/not required.
- Gatus runtime was not required and remains disabled.
- Public HTTP 503 test services can be rejected by DNS/IP safety controls.
- No local test-only dependency-injection fixture currently allows private/local 503 simulation through the production URL API.
- Live browser automation lacked a complete Playwright/E2E suite and installation was not performed.
- Real Telegram, email and Discord delivery remains future work.

## Exact Windows startup instructions

Create an isolated backend environment before the first run:

```powershell
cd E:\StackPulse\backend
Copy-Item .env.example .env
```

Replace the empty `JWT_SECRET` and set a temporary `ADMIN_BOOTSTRAP_TOKEN` of at least 32 characters. Do not use the checked example placeholders in production.

```powershell
cd E:\StackPulse\backend
npm install
npm run dev
```

In a second terminal:

```powershell
cd E:\StackPulse\frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`.

Backend health:

```powershell
curl.exe http://127.0.0.1:3001/api/health
```

Gatus and Docker are optional and are not required for this startup.

## Test/build commands

```powershell
cd E:\StackPulse\backend
npm test -- --runInBand
npm run build

cd E:\StackPulse\frontend
npm run build
```

## Recommended Phase 2 implementation order

1. Fix P1 multi-user isolation and ownership semantics.
2. Add supervised persistent worker recovery and interruption tests.
3. Add authorized local or injected HTTP 503/timeout fixtures for live cycle testing.
4. Expand browser E2E coverage and viewport/console automation.
5. Add real notification delivery: Telegram, email and Discord.
6. Implement PDF and CSV reports.
7. Add Socket.IO only when justified by live UX needs.
8. Implement responsive redesign from measured browser findings.
9. Add Capacitor Android, native push notifications and local/public deployment automation.
10. Retain SQLite and zero-cost infrastructure unless a scaling requirement justifies migration.

## Future requirements retained

- Multiple users with isolated monitored services.
- Persistent worker reliability.
- Real Telegram, email and Discord notifications.
- Responsive website redesign.
- Socket.IO where justified.
- PDF and CSV reports.
- Capacitor Android application.
- Native push notifications.
- Local and public deployment.
- Zero-cost infrastructure wherever feasible.
- No generative AI in the product scope.
