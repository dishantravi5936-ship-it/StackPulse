# StackPulse Phase 1.3 — Live Monitoring Validation

**Date:** 2026-11-26
**Scope:** Native Node.js HTTP monitoring, scheduling, persistence, incidents, failure verification and TLS behavior

## Controlled HTTP fixture

The HTTP fixture test uses a real local `http.Server` and mocks the destination resolver only inside Jest. Production SSRF validation remains unchanged. The fixture returned controlled 200, 503, 404, delayed, expected-content, incorrect-content and redirect responses.

## Executed results

| Scenario | Method | Actual result | Status |
|---|---|---|---|
| Healthy HTTP 200 | Real local HTTP server | Success, status 200, latency measured | PASS |
| HTTP 503 | Real local HTTP server | Success=false, status 503, `http_status` | PASS |
| HTTP 404 | Real local HTTP server | Success=false, status 404, `http_status` | PASS |
| Configured status mismatch | Real local HTTP server | 204 with expected 201 produced `http_status` | PASS |
| Correct expected content | Real local HTTP server | Success=true | PASS |
| Incorrect expected content | Real local HTTP server | Success=false, `functional_assertion` | PASS |
| HTTP redirect | Real local HTTP server | 302 response was not followed; one request observed | PASS |
| Delayed response | 120 ms fixture delay | Latency >=100 ms and successful status | PASS |
| Timeout | 9-second fixture delay | Request terminated by product 8-second timeout as `timeout` | PASS |
| Three failures/one incident | Temporary SQLite integration test | Exactly one active incident after three failures; fourth updated same incident | PASS |
| Recovery | Temporary SQLite integration test | One successful check resolved incident and generated recovery notification records | PASS |
| Pause and resume | Temporary SQLite integration test | Pause/resume routes updated endpoint state and schedule history | PASS |
| Duplicate scheduled check | Temporary SQLite integration test | Repeated `checkNow` returned the same existing check ID | PASS |
| Multiple concurrent endpoints | Existing `runDueChecks` implementation plus integration architecture | Implementation executes endpoints concurrently with per-endpoint in-flight deduplication | PARTIAL |
| Failure verification separation | Failure-verification unit tests | Verification retries persist separately and do not alter scheduled health-check counts | PASS |

## Complete outage-to-recovery evidence

The integration test deterministic timeline is:

1. Initial healthy/native check recorded.
2. Repeated HTTP-failure checks were inserted with timestamps.
3. The third failure opened one active incident.
4. A fourth failure incremented the same incident failure count.
5. A successful check resolved the same incident.
6. Notification count changed from two creation records to four total creation/recovery records.

This was test-database evidence, not fabricated public monitoring history.

## Scheduling and worker behavior

Scheduling is implemented by `MonitoringService.checkNow` using persisted schedule history and `scheduled_check_id = scheduleId:scheduleSlot`. The native worker polls every 5 seconds and runs enabled endpoints concurrently.

Pause closes the active schedule and sets `enabled=0`; resume creates a new schedule row. The worker excludes paused endpoints from `runDueChecks`.

## TLS

Native TLS metadata extraction is implemented, but no live authorized HTTPS endpoint was available during this Phase. Existing evidence was limited to controlled certificate tests and source inspection. TLS validity/expiry persistence remains:

- BLOCKED for live public certificate validation.
- PASS for deterministic existing unit coverage of certificate helper behavior where tests already provide evidence.

## Browser independence

The native worker is a backend process interval, not a frontend interval. The browser was not required for worker execution. A browser-closed live wall-clock run was not executed in this environment, so this remains a source-confirmed behavior rather than a live measured result.

## Bugs found

No confirmed production scheduling, incident, persistence or HTTP-result bug was found in the traced implementation.

One test-harness issue was found and fixed: the timeout regression must run longer than Jest's 5-second default. The test now has a 12-second bound and tracks fixture timers.

## Test/build evidence

- Backend tests: 51 passed across 7 suites.
- Added HTTP fixture coverage: 9 tests in `httpMonitor.service.test.ts`.
- Backend build: passed.
- Frontend build: passed.
- Git whitespace check: passed.

## Remaining blockers

- Live 30-second wall-clock outage/recovery with a real authorized service was not executed.
- Live authorized HTTPS certificate validity/expiry was not executed.
- Browser-close/worker persistence was not measured live.
- External endpoint request support was unavailable within the bounded local validation.
