# Gatus Integration Validation

**Validation date:** 2026-11-25  
**Environment:** Windows; Node.js v24.15.0; npm 11.12.1; Git 2.52.0; Docker CLI 29.9.3; Docker Compose v5.7.1

## Executive result

**Gatus integration is not validated and must not be treated as production-ready.** Docker is installed, but the Docker Engine is not running. Consequently Gatus could not be started, the live API could not be queried, and runtime reload, restart persistence, and endpoint changes could not be tested against Gatus.

At validation time, the existing application had a native monitoring fallback, TLS worker, Gatus client, config writer, and endpoint CRUD. The backend MVP has since made its native worker authoritative, added destination pinning, and added guarded Gatus config verification/rollback. Builds and tests validate these application behaviors, but do not prove that a running Gatus instance reloads generated files or serves the expected data.

Given the configured history depth and the absence of demonstrated Gatus egress controls, use the native Node.js checker and StackPulse SQLite `health_checks` as the authoritative monitoring path. Dynamic Gatus config is disabled by default; when explicitly enabled, only public IP-literal destinations are emitted and the integration waits for fresh per-endpoint results before marking an update applied.

## Environment and execution

| Check | Result | Evidence |
|---|---|---|
| Node.js / npm / Git | Available | Versions listed above |
| Docker CLI / Compose | Available | Docker 29.9.3; Compose 5.7.1 |
| Docker Engine | **Unavailable** | `docker info` failed because `dockerDesktopLinuxEngine` named pipe was missing |
| Compose configuration | Passed static validation | `docker compose config` successfully rendered the service |
| Gatus at `localhost:8080` | **Not running** | `/api/v1/endpoints/statuses` connection failed |
| Gatus version / image digest | **Not captured** | No running engine or locally inspectable image; `docker image inspect` could not connect |
| Compose startup | Not run | Would fail while the Engine is unavailable |

The Compose file mounts `monitoring/config/config.yaml` read-only inside the Gatus container and mounts `monitoring/data` for SQLite. The config file itself sets `storage.type: sqlite`, path `/data/gatus.db`, and `maximum-number-of-results: 5000`.

## Follow-up native backend runtime verification

The backend was subsequently built and started against an isolated temporary SQLite database with random test-only JWT and bootstrap secrets. A live `https://example.com/` endpoint was registered through the authenticated StackPulse API. The native checker connected successfully and persisted an HTTP 200 result (491 ms in the observed run, `source: native`). The same result was returned by the endpoint checks API, and its opted-in public status API returned `operational`.

The same HTTP run verified health, first-admin bootstrap enforcement, login, regular-user registration, dashboard/incidents/notifications routes, and cross-owner endpoint isolation (404). A focused follow-up confirmed that native results and endpoint detail exposed TLS expiry, issuer, and common name, and the public status response marked TLS metadata available. A separate temporary legacy-schema migration test confirmed check import, schedule backfill, interval normalization, immutable key backfill, incident preservation, and first-admin ownership backfill. Backend build and all 16 automated tests passed after these changes.

This follow-up verifies StackPulse's native monitoring path only. It does **not** validate a live Gatus image, its API, config reload, history persistence, or Gatus egress restrictions. The test database and temporary credentials were isolated from the project database and removed after validation.

## API schema evidence (not a live response)

No live Gatus API response was captured. The following field names were checked against TwiN/Gatus source at commit `d3d15d0577b96e0076952006f2a700df650674e7`, not against an installed image. This source revision may not match the unavailable deployment image.

The source's endpoint status DTO defines `name`, `group`, `key`, `results`, and optional `events`. A result serializes:

| JSON field | Meaning |
|---|---|
| `status` | HTTP response status code |
| `hostname` | Hostname extracted from the configured URL |
| `duration` | `time.Duration` serialized as an integer nanosecond value |
| `errors` | Optional errors |
| `conditionResults` | Optional condition strings and their boolean success values |
| `success` | Whether the result passed |
| `timestamp` | Request timestamp |

The source explicitly excludes `CertificateExpiration`, `DomainExpiration`, `Connected`, and resolved `IP` from JSON (`json:"-"`). It does not expose certificate issuer or common name in the result DTO. Therefore the API cannot be relied on for structured certificate expiry/issuer/CN metadata; the separate native TLS worker is intended to collect that information.

The source API test documents `GET /api/v1/endpoints/statuses` with `page` and `pageSize`, and `GET /api/v1/endpoints/{key}/statuses` with the same pagination parameters. Those routes and their behavior remain unverified against the actual image.

Source references:
- [`api/endpoint_status.go`](https://github.com/TwiN/gatus/blob/d3d15d0577b96e0076952006f2a700df650674e7/api/endpoint_status.go)
- [`api/endpoint_status_test.go`](https://github.com/TwiN/gatus/blob/d3d15d0577b96e0076952006f2a700df650674e7/api/endpoint_status_test.go)
- [`config/endpoint/status.go`](https://github.com/TwiN/gatus/blob/d3d15d0577b96e0076952006f2a700df650674e7/config/endpoint/status.go)
- [`config/endpoint/result.go`](https://github.com/TwiN/gatus/blob/d3d15d0577b96e0076952006f2a700df650674e7/config/endpoint/result.go)

## Existing Gatus SQLite file

The existing ignored `monitoring/data/gatus.db` was opened read-only. It contains:

- 4 endpoint rows
- 225 individual result rows, 119 marked successful
- 428 condition-result rows
- 16 event rows
- Result timestamps span `2026-11-25 12:11:09 UTC` through `2026-11-25 12:57:45 UTC`
- Stored result columns include `status`, `duration`, `timestamp`, and `certificate_expiration`

This is evidence that a Gatus-format SQLite database with historical rows exists. It does **not** prove which exact image produced it, that history survives a controlled restart or configuration edit, or that those rows are available through the live HTTP API. The database was not modified.

## Validation matrix

| Requirement | Result | Notes |
|---|---|---|
| HTTP status, latency, timestamps, success/failure | Source-confirmed only | Live JSON was unavailable; `duration` is nanoseconds |
| TLS certificate metadata from Gatus API | Not available in checked source DTO | Certificate expiry is excluded from JSON; issuer/CN are absent |
| SQLite history storage | Configured; existing history observed | Controlled config-change/restart persistence test was not possible |
| Config hot reload | **Not verified** | No running Gatus process to observe |
| Add/edit/delete endpoint in Gatus | **Not verified** | Application CRUD/config generation passed in isolation and a native HTTP endpoint was verified live; no running Gatus watcher/API was available |
| Gatus write API | None assumed or used | Endpoint changes are application-side database/config-file operations, not Gatus POST/PUT/DELETE calls |
| History across restart or removal/re-add | **Not verified** | Existing rows are not a controlled persistence test |
| Expected versus completed checks | Implemented in StackPulse API | Schedule history records supported intervals; public status returns expected/completed/missed counts. No missed check resolves an incident |
| 90-day individual-result coverage | **Insufficient at current setting** | 5,000 results at a 30-second interval cover at most 41h 40m; 90 days at that interval requires 259,200 results per endpoint, before gaps |
| URL destination security | Native path hardened; Gatus egress unverified | Native checks validate all DNS answers and connect to a pinned public address, do not follow redirects, and enforce time/size/concurrency limits. Gatus dynamic config is disabled by default; explicit Gatus mode restricts destinations to public IP literals and disables redirects |
| Native endpoint configured and monitored through StackPulse API | **Passed** | Public `example.com` returned HTTP 200; the persisted native result was retrieved through `/api/endpoints/:id/checks` and public status was operational |
| Gatus version / image digest | **Unavailable** | Docker Engine unavailable; no installed image could be inspected |

The app-side CRUD exercise used a temporary database and temporary config file and cleaned them up afterward. It tested application persistence/config generation only; it did not test a Gatus watcher or live reload.

## URL security assessment

Endpoint creation/update checks HTTP(S), rejects embedded credentials and non-global IPv4/IPv6 ranges, resolves every DNS answer, and rejects a hostname if any answer is private or reserved. At request time, the native checker resolves again and connects to one of the checked public IP literals directly (preserving the URL host for HTTP Host/SNI). Redirects are not followed. It limits each request to 8 seconds, 64 KiB, and at most three concurrent connections.

The native HTTP and TLS connections use destination pinning, closing the save-time DNS rebinding gap. User endpoint creation is administrator-only; first-admin registration requires a temporary `ADMIN_BOOTSTRAP_TOKEN`. The Gatus engine independently resolves/connects and has not been runtime-tested under network egress restrictions. Dynamic Gatus config therefore stays off by default and rejects DNS hostnames; do not enable it outside administrator-approved, authorized test endpoints without separately enforcing and validating engine egress policy.

## Recommendation and outstanding tests

Keep the Gatus status as **blocked / not validated**. The Node.js monitoring worker and StackPulse SQLite results are the primary source for checks, uptime, and expected/completed accounting. Gatus remains optional and its read-only API is not a control plane.

When Docker Engine is available, repeat these tests against the exact image and record its version and digest:

1. Start Gatus with the root Compose file and capture the actual `/api/v1/endpoints/statuses` response.
2. Verify status, duration units, timestamps, success, conditions, event shape, pagination, and whether any TLS data appears.
3. Add, edit, and remove a test endpoint through StackPulse; confirm each config change reloads and appears/disappears through the read API without restart.
4. Record endpoint results, restart Gatus, and confirm the same history remains. Repeat across config edits and remove/re-add using the same key.
5. Measure available history per endpoint and validate retention against the uptime windows StackPulse promises.
6. Confirm safe URL behavior at the actual monitoring connection, including redirects and DNS changes, before allowing user-supplied destinations.

Gatus is Apache License 2.0; attribution is preserved in [`NOTICE`](../NOTICE). Gatus remains an internal component, not a separately exposed product.
