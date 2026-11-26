# StackPulse Phase 1.4 — TrustPulse Reliability Validation

**Date:** 2026-11-26
**Scope:** Monitoring coverage, observed uptime, schedule history, freshness, interruptions, incident preservation and timestamp boundaries

## Implementation

TrustPulse uses `health_checks` as the completed-result source and `endpoint_schedule_history` as the expected-result source.

Observed uptime:

`successful completed scheduled checks / completed scheduled checks × 100`

Monitoring coverage:

`completed scheduled checks / expected scheduled checks × 100`

Missing results remain separate and are never successful or failed checks.

## Deterministic scenarios

| Scenario | Expected uptime | Actual uptime | Expected coverage | Actual coverage | Result |
|---|---:|---:|---:|---:|---|
| A: 10 expected, 10 completed, 10 successful | 100% | 100% | 100% | 100% | PASS |
| B: 10 expected, 6 completed, 6 successful | 100% | 100% | 60% | 60% | PASS |
| C: 10 expected, 8 completed, 6 successful | 75% | 75% | 80% | 80% | PASS |
| D: 10 expected, zero completed | unavailable | null | 0% | 0% | PASS |

Scenario A and B are also directly represented in schedule-aware integration assertions. Scenario C and zero-completed behavior are verified by pure coverage and snapshot tests.

## Schedule pauses and interval changes

An intentionally paused endpoint receives `freshness=paused`, and completed schedule rows stop being expected after `paused_at` closes the active schedule. A subsequent resume opens a new schedule row.

Interval changes are represented by separate schedule-history rows with `starts_at`/`ends_at`. Existing tests verify 30-second followed by 60-second schedules and exclude paused/configuration-reload periods from expected counts.

## Worker interruption and recovery

The actual singleton `MonitoringWorker.stop()` was called in an isolated TrustPulse test:

- Stopped worker snapshot retained `lastCompletedCheckAt`.
- Snapshot freshness changed to `engine_unavailable`.
- The last known service state remained the result of the latest completed check.
- Recording a fresh available engine heartbeat restored `engineStatus=available`.

A live wall-clock restart was not executed for this report. Worker behavior itself is source-confirmed and deterministic tests passed.

## Active incident preservation

A test created one active incident after three scheduled failures, stopped the native worker, and queried both the incident and TrustPulse snapshot:

- Incident remained `open`.
- Failure count remained `3`.
- TrustPulse returned the service as down and monitoring as engine-unavailable.

Missing checks did not resolve or rewrite the incident.

## Backend restart persistence

An isolated SQLite test persisted one health check and one open incident row, then confirmed both records remained readable after SQLite operations. Phase 1.2 also live-restarted the isolated Express process and confirmed account records remained after restart.

No existing database was modified or deleted.

## Duplicate, delayed and out-of-order results

Tests verify:

- Duplicate results mapping to the same schedule slot count once.
- The most recently timestamped duplicate controls the single slot result.
- A later result outside the schedule window does not inflate coverage.
- ISO UTC-offset timestamps such as `2026-06-01T14:02:00.000+02:00` are parsed to the same instant as UTC and compared with schedule slots correctly.

This UTC fix required a source change: TrustPulse no longer applies lexicographic SQLite text boundaries to recent checks or latest-service timestamps. Checks are fetched for the endpoint and date comparisons use `Date.parse`.

## Failure verification

Failure-verification tests confirm:

- Retry and reference requests remain outside `health_checks`.
- Scheduled coverage is unchanged by verification probes.
- Cooldown suppresses repeated verification.
- `globalOutageConfirmed` is always false.

## Single-host failure-domain limitation

All native checks originate from the same StackPulse host/process. This implementation cannot independently detect or prove a global outage or total host failure. If the StackPulse host is unavailable, it cannot report its own reachability; an external/reference monitoring location or distributed monitoring is required for independent confirmation.

## Test/build results

Before the UTC fix, 55 tests passed and one new UTC-boundary test failed.

After the fix:

- TrustPulse suite: 26 tests passed.
- Complete backend suite: 56 tests passed across 7 suites.
- Backend TypeScript build: passed.
- Frontend Vite production build: passed.
- Git whitespace check: passed.

## Bugs fixed

1. **UTC timestamp boundary handling**
   - File: [trustpulse.service.ts](E:/StackPulse/backend/src/services/trustpulse.service.ts)
   - Root cause: SQLite text comparisons could treat UTC and UTC-offset representations inconsistently.
   - Fix: parse timestamps with `Date.parse`, filter by numeric epoch ranges, and select latest/last-successful checks by parsed timestamp.
   - Regression coverage: UTC-offset, duplicate and out-of-order result test.

No observed uptime/coverage formula correction was needed; the implementation already uses the required independent formulas.
