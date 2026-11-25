# StackPulse — Architecture

**Version:** 0.1 (AVISHKAR'26 Hackathon)  
**Budget:** ₹0 (zero external paid services)  
**Target:** Single-machine deployment, localhost + potential public tunnel

---

## Overview

StackPulse is a developer-first uptime monitoring and public status page platform. It monitors HTTP/HTTPS endpoints, tracks incidents, and publishes a live status page from a single-machine Node.js and SQLite deployment. Gatus is an optional internal engine.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                      Browser                         │
│            React + Vite + Tailwind + shadcn/ui       │
│                   localhost:5173                      │
└──────────────────────┬──────────────────────────────┘
                       │ REST polling (every 15s)
                       │ Public status page (no auth)
┌──────────────────────▼──────────────────────────────┐
│               Node.js + Express API                  │
│                   localhost:3001                      │
│                                                      │
│  REST: auth, dashboard, endpoints, incidents, status │
│  Services:                                           │
│    - gatus.service.ts   (optional read API)           │
│    - config.service.ts  (optional safe YAML sync)    │
│    - httpMonitor.service.ts (pinned native checks)   │
│    - tls.service.ts     (bounded TLS inspection)     │
│    - monitoring.service.ts (persist and schedule)    │
│    - incident.service.ts (deterministic transitions) │
│    - trustpulse.service.ts (freshness and coverage)   │
│    - failureVerification.service.ts (bounded retry)  │
│    - incidentlens.service.ts (rule-based diagnosis)    │
│    - notification.service.ts (simulated records)     │
│  Workers:                                            │
│    - monitoring.worker.ts  (authoritative checks)    │
│    - config-sync.worker.ts (optional Gatus reconcile)│
└────────┬──────────────────────┬─────────────────────┘
         │                      │
         │ SQLite (better-sqlite3)
         │                      │ HTTP proxy
┌────────▼──────┐    ┌──────────▼──────────────────────┐
│  stackpulse.db│    │         Gatus Engine             │
│  (persistent) │    │       localhost:8080             │
│               │    │                                  │
│  - users      │    │  config: monitoring/config/      │
│  - endpoints  │    │          config.yaml             │
│  - schedules  │    │  storage: SQLite (gatus.db)      │
│  - checks     │    │  API: read-only                  │
│  - incidents  │    │  runtime integration unverified  │
│  - notifications│   │                                 │
└───────────────┘    └──────────────────────────────────┘
```

---

## Component Responsibilities

### Frontend (React + Vite)
- **Public Status Page** (`/status`) — no authentication required; intended to show all monitored services, incidents, and 90-day uptime; that window requires the persisted-history work described below
- **Admin Dashboard** (`/dashboard`) — authenticated; endpoint management, incident timeline, alert configuration
- **Components:** StatusBadge, UptimeChart (Recharts), IncidentTimeline, EndpointCard, AlertConfig
- **State:** React Query for server state; Zustand for UI state
- **Updates:** Polling every 15 seconds (REST); upgrade to WebSocket in phase 2

### Backend (Node.js + Express)
- **Auth:** First registration requires a temporary secret bootstrap token; bcrypt password hashing and 12-hour HS256 JWTs
- **Endpoint ownership:** Requests are scoped to the authenticated user; only administrator-approved endpoints are accepted
- **Monitoring:** Native HTTP checks with validated/pinned destinations are authoritative and persisted in StackPulse SQLite
- **TrustPulse:** Matches checks to persisted interval schedules with bounded timing tolerance; reports freshness, observed uptime, coverage, missing slots, and engine interruptions as distinct signals. Missing results are not failures or successes.
- **Failure verification:** A rate-limited, administrator-triggered retry may compare against an operator-authorized reference URL. These extra probes are persisted separately and excluded from scheduled uptime/coverage.
- **IncidentLens:** Deterministic diagnosis maps observed status/network/TLS/assertion evidence to possible causes and safe troubleshooting steps. It does not claim exact root causes or global outage confirmation.
- **Optional AI incident explanation:** An explicit user action can request short supplementary hypotheses from a configured local OmniRoute OpenAI-compatible endpoint. It receives only sanitized, allowlisted evidence and never participates in monitoring, availability, incident state, or automatic remediation. It is disabled until a full endpoint URL, model, and explicit free-model confirmation are configured; deterministic IncidentLens remains the fallback.
- **Incidents:** Three consecutive failed checks open one incident; recovery checks resolve it; missing data never resolves it
- **Notifications:** Simulated email/webhook records are deduplicated and require no external delivery
- **TLS:** Bounded native TLS inspection uses the same destination validation and reports missing metadata as unavailable
- **Gatus config:** Optional, disabled by default; only public IP-literal destinations are emitted when explicitly enabled

### Gatus (Optional Internal Monitoring Engine)
- Intended to run as a Docker container and perform configured checks.
- Read-only from the StackPulse backend perspective; endpoint changes are made by StackPulse database/config-file operations, not Gatus API writes.
- Current configuration uses SQLite and `maximum-number-of-results: 5000`.
- Runtime integration is **not validated**: Docker Engine was unavailable, so live API, hot reload, and restart persistence were not tested. See [GATUS_VALIDATION.md](./GATUS_VALIDATION.md).
- Dynamic config is disabled by default; if enabled, only pinned public IP-literal destinations with redirects disabled are emitted.
- Until runtime and egress checks pass, Gatus must not be the sole source of truth for checks or uptime history.

### SQLite (Application Database)
- Stored at `backend/data/stackpulse.db`
- Access: `better-sqlite3` (synchronous)
- Schema: `backend/src/database/schema.sql`, applied idempotently at startup
- Tables include `users`, owned `endpoints`, `endpoint_schedule_history`, `health_checks`, `incidents`, `incident_events`, `notifications`, and `monitoring_engine_health`
- Reliability intelligence persists engine interruptions and manual failure-verification records. `expected_content` is optional and validated by the bounded native HTTP monitor only.
- Endpoint deletion archives the endpoint and retains check/schedule/incident history

---

## Security Design

### Authentication
- Passwords: `bcryptjs` with `saltRounds: 12`
- Tokens: HS256 JWT, 12-hour expiry, configured through `JWT_SECRET` (minimum 32 characters); no default secret
- API: authenticated routes require `Authorization: Bearer <token>`; administrator-only endpoint mutations
- Public routes: `/api/health`, opted-in `/api/public/status/:slug`
- Authentication endpoints have rate limits; there is no seeded default password

### Endpoint URL Validation
- Only `http://` and `https://` are accepted.
- Embedded credentials, local/non-canonical hostnames, blocked ports, and non-global IPv4/IPv6 destinations are rejected. Every DNS answer is checked at creation and again at request time.
- Native HTTP and TLS connections pin the validated destination IP, preserve the original hostname for Host/SNI, and do not follow redirects. HTTP checks enforce an 8-second timeout, 64 KiB response limit, and concurrency cap; TLS inspection is bounded to 5 seconds and two concurrent checks.
- Endpoint mutations are administrator-only. First-admin registration requires a temporary `ADMIN_BOOTSTRAP_TOKEN`; do not expose that token or arbitrary endpoint creation to public users.
- Gatus has not been tested with enforced egress restrictions and remains disabled for dynamic endpoint configuration by default.

### Config File Safety
- YAML values are serialized using the `yaml` package; raw user input is never concatenated into config text
- Writes are serialized and atomically replaced; failed live verification restores the previous config
- Dynamic Gatus checks require explicit opt-in and IP-literal public destinations with redirects disabled
- Docker mounts the config directory (not a single file), so atomic replacement can be observed by a file watcher

---

## Data Flow: Uptime Calculation

```
StackPulse SQLite health_checks (authoritative history)
  → backend/services/uptime.service.ts
  → Count successful results / total results per endpoint and window
  → Cache in SQLite (recalculated every 5 minutes)
  → Served through authenticated endpoint APIs and public status summaries
```

**Current limitation:** The configured `maximum-number-of-results: 5000` retains at most about 41h 40m of results per endpoint at a 30-second interval. A 90-day window at that interval contains 259,200 scheduled checks per endpoint, before gaps. The Gatus results API therefore cannot supply enough individual results for that window with the current configuration.

**Source of truth:** The native worker persists each scheduled result in StackPulse SQLite and computes uptime and expected-versus-completed counts from schedule history. Long-window uptime accuracy still depends on the database being retained and backed up; a configured interval and measurement window alone do not prove every expected check completed.

TrustPulse reports observed uptime as successful matched scheduled results / completed matched scheduled results, and monitoring coverage as completed / expected scheduled results. With no completed results, observed uptime is `null`. A 100% observed value must be presented separately from coverage and does not imply uninterrupted availability. Worker interruptions preserve the last known service state and never automatically resolve active incidents.

The authenticated endpoint and dashboard APIs include TrustPulse and IncidentLens data. `POST /api/endpoints/:id/verify` is an explicit administrator action, rate-limited and cooldown-protected; optional `TRUSTPULSE_REFERENCE_URL` is an operator-authorized destination checked through the native URL security controls. Verification does not affect schedule-derived metrics. See [BACKEND_API.md](./BACKEND_API.md) for response semantics.

---

## Data Flow: Dynamic Endpoint Management

```
POST /api/endpoints  (administrator-authenticated payload)
  → Validate URL and DNS answers
  → Write endpoint to SQLite (source of truth)
  → Persist endpoint schedule history
  → Native worker connects to a validated, pinned destination and persists the check
  → Optional Gatus sync is disabled by default; if enabled, safe config and fresh-result verification are required
```

---

## Deployment (Development)

```bash
# 1. Start Docker Desktop manually
# 2. Start Gatus
docker run -d -p 8080:8080 \
  -v ./monitoring/config:/config \
  -v ./monitoring/data:/data \
  ghcr.io/twin/gatus:stable

# 3. Start backend
cd backend && npm run dev

# 4. Start frontend
cd frontend && npm run dev
```

---

## Technology Choices & Rationale

| Choice | Rationale |
|---|---|
| SQLite (not PostgreSQL) | Zero-dependency, single file, matches ₹0 budget, adequate for hackathon scale |
| Polling (not WebSocket) | Simpler, works through proxies; WebSocket upgrade deferred |
| Gatus (not custom) | Battle-tested monitoring engine, Apache 2.0, saves 2-3 days of engine dev |
| Recharts | MIT license, React-native, no CDN dependency |
| shadcn/ui | Copy-paste components, no external runtime dependency, Tailwind-native |
| JWT (not sessions) | Stateless, works without Redis |
| better-sqlite3 (not Drizzle) | Synchronous API, zero config, faster for single-process |

---

## Known Limitations (Hackathon Scope)

1. No horizontal scaling (single process)
2. Gatus startup, API shape, reload, and history persistence remain unverified in Docker; see [GATUS_VALIDATION.md](./GATUS_VALIDATION.md)
3. Gatus history is too shallow for 90 days at the configured retention; StackPulse SQLite is authoritative
4. Simulated email/webhook records are not externally delivered
5. OmniRoute at `localhost:20128` integration remains unverified

