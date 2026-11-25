# StackPulse Phase 1.2 — API Runtime Validation

**Date:** 2026-11-26
**Scope:** Real Express API startup, isolated SQLite persistence, authentication, authorization and route behavior

## Environment

- Backend: Express/TypeScript with native monitoring, Gatus disabled.
- Database: isolated temporary SQLite file under the Windows temporary directory.
- Existing `backend/.env` and existing `backend/data/stackpulse.db` were not overwritten or used.
- Server bind: `127.0.0.1:3001`.
- Frontend bind: not required for API validation.

## Live API evidence

| Test | Expected | Actual | Status |
|---|---|---|---|
| Health | 200 with native engine available | 200, `status=ok`, native `available`, Gatus `unavailable` | PASS |
| Protected endpoint without JWT | 401 | 401 `UNAUTHORIZED` | PASS |
| Invalid login | 401 | 401 `INVALID_CREDENTIALS` | PASS |
| Invalid registration | 400 | 400 `VALIDATION_FAILED` with email/password details | PASS |
| Administrator registration | 201, administrator role | 201, `role=admin` | PASS |
| Invalid bearer JWT | 401 | 401 `UNAUTHORIZED` | PASS |
| Expired JWT | 401 | Not returned by live matrix due interrupted shell | BLOCKED |
| Dashboard | 200 for administrator | 200 with empty endpoint/incident/notification arrays | PASS |
| Public status with no endpoints | 200, degraded | 200 `overall=degraded`, zero endpoints | PASS |
| Incident list | 200 owner-scoped list | 200, empty list | PASS |
| Notification list | 200 owner-scoped list | 200, empty list | PASS |
| Restart persistence | Administrator login after restart | 200, `role=admin` | PASS |
| Ordinary user registration | 201, regular role | 201, `role=user` | PASS |
| Ordinary-user endpoint creation | 403 | 403 `Administrator approval is required` | PASS |
| Cross-user endpoint detail | 404 | 404 `Endpoint not found` | PASS |
| Cross-user incident detail | 404 | 404 `Incident not found` | PASS |
| Ordinary-user notifications | 200, no cross-owner records | 200, count 0 | PASS |

## Endpoint lifecycle

The isolated integration suite verified endpoint create/edit/pause/resume/archive behavior against its temporary database, including:

- 201 create,
- 200 edit,
- 200 pause,
- 200 resume,
- 200 soft archive,
- retained health-check history,
- public-slug removal,
- ownership isolation.

The live external endpoint creation request using `https://example.com/` did not return an HTTP status within the bounded command and is marked blocked. It is not reported as successful.

## Authentication finding

Ordinary registered users can authenticate and read only their owned/private data, but endpoint mutations remain administrator-only. This is the architectural mismatch identified in the earlier audit and is accurately recorded for a later authorization phase.

No confirmed cross-user data leak was found. No public deployment is recommended until multi-user endpoint ownership and authorization are intentionally redesigned and tested.

## Database and workers

Repeated migrations completed successfully in the isolated database. Native monitoring, config-sync and TLS workers started. Gatus remained disabled. No existing runtime database or secret file was overwritten.

## Test/build evidence

- Backend tests: 51 passed across 7 suites after adding HTTP monitoring regressions.
- Backend production build: passed.
- Frontend production build: passed.
