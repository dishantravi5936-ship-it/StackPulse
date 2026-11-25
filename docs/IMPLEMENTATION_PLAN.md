# StackPulse — Implementation Plan

**Event:** AVISHKAR'26  
**Developer:** Solo, AI-assisted  
**Budget:** ₹0  
**Timeline:** Hackathon sprint

---

## Phase 0 — Environment & Gatus Validation ⚠️ GATUS BLOCKED

| Task | Status | Notes |
|---|---|---|
| Check Node.js, npm, Git | ✅ Done | v24.15.0 / 11.12.1 / 2.52.0 |
| Check Docker | ⚠️ Partial | CLI and Compose available; Docker Engine named pipe is unavailable |
| Validate Compose config | ✅ Done | `docker compose config` succeeds |
| Probe Gatus API | ❌ Blocked | `localhost:8080` unavailable |
| Document API schema | ⚠️ Source-only | Checked TwiN/Gatus at commit `d3d15d0577b96e0076952006f2a700df650674e7`; not verified against an installed image |
| Inspect existing Gatus SQLite | ✅ Done | Read-only: 4 endpoints, 225 results, 428 condition results, 16 events |
| Test controlled history persistence | ❌ Not tested | No running Gatus instance |
| Capture installed Gatus version/digest | ❌ Not available | Docker Engine unavailable; no local image inspect possible |
| Exercise app endpoint CRUD/config generation | ✅ Done | Isolated temporary SQLite/config files; no live Gatus reload |
| Write GATUS_VALIDATION.md | ✅ Done | Honest results recorded |
| Write ARCHITECTURE.md | ✅ Done | |
| Write IMPLEMENTATION_PLAN.md | ✅ Done | This file |
| Update AGENTS.md | ✅ Done | |
| Write .gitignore | ✅ Done | |

**Decision:** Gatus integration has not passed validation. At 30-second intervals, the configured 5,000-result history covers at most 41h 40m, not 90 days. The native Node.js checker and StackPulse SQLite are authoritative; dynamic Gatus config stays disabled until runtime reload and egress behavior are verified.

**Backend gate:** The MVP backend is implemented. Its TypeScript build and all 16 automated tests pass. A live `https://example.com/` endpoint was created, checked (HTTP 200), persisted, and retrieved through StackPulse's checks and public-status APIs using an isolated temporary database. Legacy schema migration/backfill also passed. The condition to begin frontend work is satisfied; frontend implementation remains a separate next phase.

---

## Phase 1 — Backend Foundation

### 1.1 Project Setup
- [x] `backend/package.json` — dependencies defined
- [x] Dependencies installed in backend and frontend (existing `node_modules`)
- [x] `tsconfig.json` files present
- [x] `backend/src/database/schema.sql` — SQLite schema present
- [x] `backend/src/database/db.ts` — better-sqlite3 connection present
- [x] `backend/.env` exists locally; secrets are ignored and were not inspected

### 1.2 Database Schema (SQLite)
The current schema and compatibility migrations are defined in `backend/src/database/schema.sql` and `backend/src/database/db.ts`. They persist users, owned endpoints, schedule history, idempotent health checks, incidents/events, simulated notifications, and monitoring-engine health, with indexes and foreign keys.

### 1.3 Core Services
- [x] `gatus.service.ts` — optional HTTP client wrapping the read-only Gatus API
- [x] `config.service.ts` — serialized YAML generation, atomic writes and rollback; runtime use disabled by default
- [x] `uptime.service.ts` — uptime from persisted StackPulse checks
- [x] `tls.service.ts` — bounded native Node.js TLS metadata checks
- [x] `auth.service.ts` — JWT sign/verify, bcrypt and temporary first-admin bootstrap token
- [x] `endpoint.service.ts` — owner-scoped CRUD, schedule history and optional config reconciliation

### 1.4 Routes & Controllers
- [x] Authentication, health, dashboard, owned endpoints, incidents, notifications and public status routes
- [x] Endpoint create/edit/delete/pause/resume and checks retrieval; admin-only mutations
- [x] Consistent success/error JSON envelopes and documented status codes in `docs/BACKEND_API.md`

### 1.5 Middleware and security
- [x] JWT authentication, ownership checks, Zod request validation and Winston request logging
- [x] Authentication rate limits, Helmet headers and configured CORS origin
- [x] SSRF controls validate DNS answers and pin destination IPs at connection time; redirects are not followed

---

## Phase 2 — Optional Gatus Integration (runtime tests blocked pending Docker Engine)

- [x] Configure `monitoring/config/config.yaml` to use SQLite storage
- [x] Add persistent data and config-directory mounts to `docker-compose.yml`
- [x] Implement optional config-sync worker and serialized YAML writes
- [ ] Test hot-reload by modifying config.yaml against a running Gatus instance
- [x] Use immutable UUID-derived endpoint keys
- [x] Use StackPulse SQLite health checks as the authoritative history source
- [ ] Test pagination and uptime calculation against live, known results
- [ ] Run controlled config-edit/restart tests to verify SQLite history survives

---

## Phase 3 — Frontend

### 3.1 Public Status Page (`/status`)
- [ ] Overall status banner (all operational / degraded / outage)
- [ ] Per-service status cards using only uptime windows backed by available persisted data
- [ ] Active incidents section
- [ ] Last-checked timestamp

### 3.2 Admin Dashboard (`/dashboard`)
- [ ] Login page
- [ ] Endpoint list with live status badges
- [ ] Add/Edit/Delete endpoint form (with URL validation feedback)
- [ ] Response time chart (Recharts, 24h)
- [ ] Incident management panel

### 3.3 Components
- [ ] `StatusBadge` — coloured pill (operational/degraded/down)
- [ ] `UptimePill` — 90-day uptime % badge
- [ ] `UptimeChart` — Recharts bar chart for response time history
- [ ] `EndpointCard` — summary card with status + latency
- [ ] `IncidentBanner` — active incident alert bar
- [ ] `AddEndpointModal` — form with SSRF-safe URL input

---

## Phase 4 — Security Hardening

- [x] SSRF protections: reject private/reserved destinations, validate DNS, pin connection IP, disable redirects, enforce time/size/concurrency limits
- [x] Rate limiting on auth endpoints (`express-rate-limit`)
- [x] Input validation for API requests with Zod
- [x] Helmet security headers
- [x] Configured CORS origin
- [ ] JWT `httpOnly` cookie mode (optional upgrade from Bearer)

---

## Phase 5 — Polish & Demo Prep

- [ ] Seed script for demo data (`npm run seed`)
- [ ] Docker Compose production config
- [ ] README with one-command setup
- [ ] Screenshot walkthrough in `docs/`
- [ ] Load test with 50 endpoints (verify Gatus memory + StackPulse API latency)

---

## Deferred (Post-Hackathon)

- WebSocket live updates (replace polling)
- Email/Slack/webhook notifications (requires SMTP or Slack token)
- Multi-user / org support
- Public subdomain per status page
- OmniRoute integration (once reachable)
- Ollama-powered incident RCA suggestions

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Docker Desktop won't start | Medium | High | Native Node.js monitor is authoritative; Gatus optional |
| Gatus history insufficient for 90-day uptime | High | High | Use StackPulse SQLite results/rollups as the authoritative history; 5,000 Gatus results cover only 41h 40m at 30s |
| Config.yaml race condition | Low | Medium | Mutex lock in config-sync worker |
| SSRF via endpoint URL | Medium | Critical | DNS validation plus pinned native connections and no redirects; Gatus egress remains unverified and dynamic config stays disabled |
| SQLite concurrency under load | Low | Low | Single-writer design; acceptable for hackathon |

