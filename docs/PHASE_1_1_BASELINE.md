# StackPulse Phase 1.1 Baseline

**Date:** 2026-11-26
**Scope:** Generative-AI removal and Phase 1.1 baseline verification

## Workspace state

- Repository: `main`, tracking `origin/main`.
- Git worktree was checked without reset or destructive checkout commands.
- The baseline workspace was clean at the start of the final Phase 1.1 verification.
- Docker and Gatus runtime services were not prerequisites.
- OmniRoute/Ollama runtime services were not running or required.
- No dependency installation was performed.

## Initial baseline evidence

Before the AI-removal source changes, the reproduced baseline was:

- Backend tests: 49 tests passed across 7 suites.
- Backend TypeScript build: passed.
- Frontend TypeScript/Vite production build: passed.
- Docker Compose static parsing: passed.
- Docker Engine runtime: unavailable.
- Backend lint: unavailable because ESLint was not installed in the backend workspace.
- Frontend lint: unavailable because no ESLint configuration was present.

## AI/removal trace

The final workspace has no executable references to:

- `incidentExplanation.service.ts`
- `/api/incidents/:id/explain`
- OmniRoute environment variables or requests
- Ollama environment variables or requests
- AI explanation buttons or AI-only frontend types
- AI-only integration tests

No AI-specific package dependency is declared in the backend or frontend manifests or lockfiles. Shared HTTP dependencies remain because they are used by Gatus/native monitoring or frontend API calls.

## Preserved functionality

The following remain in place:

- Native Node.js HTTP/HTTPS monitoring
- 30/60/120-second native scheduling workers
- HTTP status and latency persistence
- Expected-status and expected-content assertions
- Native TLS certificate inspection
- Deterministic `incidentlens.service.ts`
- TrustPulse schedule-aware coverage and freshness
- Failure verification
- Incident lifecycle and notification records
- Public status endpoints
- SQLite persistence

## Current verification

The post-removal verification is:

- Backend tests: 48 tests passed across 7 suites.
- Backend TypeScript build: passed.
- Frontend TypeScript/Vite production build: passed.
- Test count changed by exactly one AI-only integration test removed.

The removed test exclusively exercised the generative OmniRoute explanation API, cache, timeout, sanitization and fallback behavior. It was not a deterministic IncidentLens or monitoring test.

## Remaining blockers

- Docker Engine and Gatus runtime validation remain unavailable.
- No live authorized external endpoint was used for Phase 1.1.
- Frontend/backend lint configuration remains incomplete.
- Live browser/incident workflows remain to be exercised in the broader Phase 1 scope.

Phase 1.1 is complete for AI removal and the local build/test baseline.
