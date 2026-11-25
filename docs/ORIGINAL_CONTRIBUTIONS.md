# StackPulse original contributions

## Reused components

- **Gatus** (`TwiN/gatus`, Apache License 2.0) is an optional internal monitoring engine referenced by the Compose configuration. Its engine, configuration conventions, and read-only API are reused; Gatus is not rebranded or exposed as a separate user product.
- **React, Express, SQLite, and npm libraries** provide application/runtime building blocks. Their notices and observed direct dependency licenses are listed in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
- No Gatus source code is vendored in this repository. StackPulse does not call nonexistent Gatus write endpoints.

## Developed for StackPulse

- Express API, administrator bootstrap/authentication, endpoint ownership, endpoint CRUD, SQLite persistence, and the endpoint schedule-history model.
- Native Node.js HTTP and TLS checkers. These validate destination DNS answers, pin a checked address at connection time, bound request size/time/concurrency, and do not follow redirects.
- TrustPulse schedule-aware expected/completed/missing result accounting, freshness and engine interruption reporting, and separate observed uptime versus monitoring coverage.
- Failure Verification with bounded retry/reference checks that are excluded from scheduled uptime/coverage.
- Deterministic IncidentLens evidence classification, possible causes, troubleshooting guidance, and limitations; no automatic repairs or asserted exact root cause.
- Incident lifecycle/timeline rules, simulated email/webhook records, and deduplication.
- Public status response shaping, React/Vite dashboard and endpoint/incident/status pages, polling behavior, and status/freshness presentation.
- Optional Gatus configuration serialization/reconciliation wrapper, including atomic update/rollback logic. Runtime Gatus behavior remains unverified.

## What the audit established

Automated tests and isolated runtime checks verify many application-level behaviors. They do not establish Gatus runtime compatibility, real external service monitoring, external notification delivery, or a full production deployment. See [TEST_RESULTS.md](./TEST_RESULTS.md) and [SECURITY_LIMITATIONS.md](./SECURITY_LIMITATIONS.md).
