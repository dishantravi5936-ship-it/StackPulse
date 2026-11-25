# StackPulse — AGENTS.md

## Project Overview
StackPulse is a developer-first infrastructure monitoring and status page platform built for AVISHKAR'26.

## Repo Layout
```
frontend/   React + TypeScript + Vite + Tailwind + shadcn/ui
backend/    Node.js + Express + TypeScript — REST API
monitoring/ Gatus configuration for active health checks
docs/       Architecture decisions, API references, runbooks
```

## Key Services (backend/src/services/)
| File | Responsibility |
|---|---|
| `gatus.service.ts` | Wraps Gatus REST read API — fetches endpoint statuses with pagination |
| `config.service.ts` | Serializes YAML; atomically writes config.yaml and rolls back if application verification fails |
| `httpMonitor.service.ts` | Native bounded HTTP checks with destination pinning; authoritative result source |
| `monitoring.service.ts` | Schedules and persists unique checks; drives incident transitions |
| `trustpulse.service.ts` | Schedule-aware observed uptime, monitoring coverage, freshness, engine health, and interruption history |
| `uptime.service.ts` | Computes uptime from TrustPulse schedule-matched StackPulse checks; Gatus history is not authoritative |
| `incidentlens.service.ts` | Deterministic evidence-based failure diagnoses; never asserts an exact root cause |
| `incidentExplanation.service.ts` | Optional, sanitized local-OmniRoute suggestions; IncidentLens remains authoritative |
| `failureVerification.service.ts` | Bounded operator-triggered retry/reference checks; verification never counts as a scheduled result |
| `tls.service.ts` | Native Node.js tls.connect() checks for cert expiry, issuer, CN |
| `auth.service.ts` | JWT sign/verify + bcrypt password hashing |
| `endpoint.service.ts` | CRUD for monitored endpoints; orchestrates config sync |
| `incident.service.ts` | Incident lifecycle management |

## Workers (backend/src/workers/)
| File | Responsibility |
|---|---|
| `monitoring.worker.ts` | Periodic authoritative native Node.js HTTP checks |
| `config-sync.worker.ts` | Reconciles optional Gatus config from SQLite source of truth |
| `tls.worker.ts` | Runs TLS checks on a schedule (every 1h per endpoint) |

## Development Conventions
- **TypeScript strict mode** everywhere — no `any` unless unavoidable
- Services are singletons exported as `default new XService()`
- Use `zod` for all request body validation in controllers
- Use `winston` for structured logging — no raw `console.log` in production paths
- Database: `better-sqlite3` (synchronous) — no Drizzle or Prisma overhead
- Database access goes through `backend/src/database/` only — never raw SQL in controllers
- Native endpoint requests validate all DNS answers, pin the chosen public IP at connection time, and do not follow redirects; Gatus egress remains unverified and dynamic config stays disabled by default

## Architecture Decisions
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Gatus Integration
See [docs/GATUS_VALIDATION.md](docs/GATUS_VALIDATION.md)

- Gatus integration is currently **not runtime-validated**; Docker Engine was unavailable during validation.
- Gatus API is **read-only** — no write endpoints exist
- Dynamic Gatus config is disabled by default; native Node.js monitoring is authoritative
- If explicitly enabled, config emits only public IP-literal destinations with redirects disabled; configuration application must be confirmed by fresh Gatus results
- All TLS metadata comes from bounded native Node.js inspection, not Gatus
- Gatus storage must be `sqlite` (not memory) for history persistence
- Current `maximum-number-of-results: 5000` is about 41h 40m at a 30-second check interval, not 90 days
- StackPulse SQLite `health_checks` is the monitoring source of truth; repeated scheduled results are deduplicated and endpoint deletion retains history
- Endpoint mutations require an administrator; the first registration requires a temporary `ADMIN_BOOTSTRAP_TOKEN`; no default credentials are seeded
- Native URL validation resolves and blocks unsafe DNS answers, pins a chosen public IP at connect time, disables redirects, enforces timeouts/size/concurrency limits
- TrustPulse observed uptime counts successful completed scheduled checks only; monitoring coverage separately reports completed versus expected checks, and missing results are never treated as successes or incident recovery
- Failure verification is an explicit, rate-limited administrator action; optional `TRUSTPULSE_REFERENCE_URL` must be operator-authorized and is checked using native destination security controls
- Endpoint and dashboard responses expose TrustPulse metrics and IncidentLens evidence; diagnostics are hypotheses and never claim a global outage or exact root cause
- Gatus remains a separate egress risk; dynamic Gatus config only accepts public IP literals and remains off until its behavior is verified

## Backend API
See [docs/BACKEND_API.md](docs/BACKEND_API.md) for routes, authorization, error formats, public status, and runtime constraints.

## Environment
```
# REQUIRED before running
cp backend/.env.example backend/.env
# Set JWT_SECRET and a temporary ADMIN_BOOTSTRAP_TOKEN before first registration
```

## Running Locally
```bash
# 1. Start Docker Desktop manually (optional Gatus integration)
# 2. Optionally start Gatus
docker run -d -p 8080:8080 \
  -v %CD%/monitoring/config:/config \
  -v %CD%/monitoring/data:/data \
  ghcr.io/twin/gatus:stable

# 3. Install dependencies if needed
cd backend && npm install
cd ../frontend && npm install

# 4. Run backend
cd backend && npm run dev

# 5. Run frontend
cd frontend && npm run dev
```

## Important API Notes
- Gatus field `duration` is in **nanoseconds** — divide by 1,000,000 for milliseconds
- StackPulse Gatus keys are immutable: `stackpulse_{endpoint UUID without hyphens}`
- TLS data is NOT in Gatus API — only condition pass/fail is available
- Gatus has NO write API — POST/PUT/DELETE on /api/v1/endpoints do not exist

## Testing
```bash
cd backend && npm test
```

## Stack
- Frontend: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Lucide React
- Backend: Node.js, Express, TypeScript, better-sqlite3, JWT, bcryptjs, zod, winston
- Monitoring: Gatus (Apache 2.0, by TwiN) — internal engine, not exposed to users
- Database: SQLite (stackpulse.db)
- Budget: ₹0 — no paid APIs or cloud services
