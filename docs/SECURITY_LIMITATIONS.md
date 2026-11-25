# StackPulse security limitations

**Audit date:** 2026-11-25

This document records controls exercised during the StackPulse audit and the boundaries that remain unproven. It is not a penetration-test certification.

## Security review result

The security-review subagent reported no vulnerabilities in the reviewed branch changes. That review covered the changed code diff, not every dependency, deployment option, or live infrastructure boundary. The audit's live checks and limitations are documented in [TEST_RESULTS.md](./TEST_RESULTS.md).

## Controls exercised

- The API rejected unauthenticated and invalid-token endpoint reads with `401`. Integration tests verified owner isolation and administrator-only endpoint mutations.
- The first administrator requires an explicit bootstrap token; passwords are hashed and no default account is seeded.
- The backend now listens on `127.0.0.1` by default. The audit observed the previous unspecified listener as `::`, changed the default, then observed `127.0.0.1` and confirmed `/api/health` still returned `ok`.
- Endpoint validation restricts schemes to HTTP(S), rejects embedded credentials, local/private/reserved IPs, metadata names, and prohibited ports. DNS resolution rejects the entire set if any returned address is blocked.
- The native HTTP/TLS services connect to the validated address rather than resolving the user hostname again at socket creation. HTTP redirects are not followed. Requests have an 8-second timeout, 64 KiB response bound, and concurrency limit; TLS inspection is bounded and separately concurrency-limited.
- Audit checks rejected a loopback endpoint through the live API, rejected a mixed public/private DNS answer using a controlled resolver, and verified a 302 was not followed by a controlled HTTP fixture.
- Public status integration tests verify private endpoint URLs and failure classifications are omitted. AI input is allowlisted/sanitized in tests and does not include URL, body, title, tokens, or secrets.

## Important limitations and safe-use requirements

### Endpoint and network controls

- Destination validation is application-level. No host firewall, container policy, or network egress allowlist was demonstrated. Keep endpoint creation administrator-only and monitor only destinations you own or have explicit permission to probe.
- A controlled mixed-DNS test is not a live DNS-rebinding test. The native path pins an IP selected from validated DNS answers, but this audit did not test rebinding against a real resolver or enforce network isolation below Node.js.
- Gatus resolves and connects independently. Its egress controls, reload behavior, and API were not tested. Dynamic Gatus configuration remains disabled by default; do not enable it as a security boundary or sole source of truth.
- The API's default `HOST=127.0.0.1` is safe for the local Windows procedure. Setting `HOST=0.0.0.0` or another non-loopback address is an operator opt-in and may expose the service to a LAN. Use it only behind a firewall and TLS-terminating reverse proxy; no public deployment was audited.
- The backend development server does not provide production TLS termination. Do not expose it directly to the internet.

### Monitoring and data quality

- No authorized external test endpoint was supplied. Actual public-service monitoring, real outage/recovery cadence, and persistence of real monitoring history were not observed.
- A TLS helper test extracted metadata from a controlled self-signed certificate; it was correctly marked untrusted. A valid public certificate chain and its full persisted API representation remain unverified.
- Missing results are represented separately from failures and do not resolve incidents, but monitoring coverage cannot prove that a successfully completed request is representative of every user or network.

### Optional AI

- AI is disabled unless an exact local OmniRoute URL, model, and explicit free-model confirmation are configured. The actual OmniRoute listener was unavailable during the audit; no endpoint path, model, or API key was inferred.
- Automated AI tests use a local fake provider and verify sanitation, bounded output, caching, rate-limit handling, timeout fallback, and disabled fallback. They do not certify the actual OmniRoute contract or model safety.
- AI suggestions remain unverified and are never used for health, incident transitions, or automatic repairs.

### Persistence, rate limiting, and operations

- SQLite persistence was confirmed across an isolated API restart. Production backup/restore, filesystem permissions, corruption recovery against a real application database, and concurrent multi-process access were not tested.
- Rate limiting and request validation are implemented and selected error cases are covered, but no load or distributed/rate-limit bypass assessment was run. The process-local design is single-instance.
- Docker Engine was not running. No Gatus container was stopped or restarted, and the existing Gatus database/WAL/SHM files were preserved.

## Operational restrictions until further validation

1. Keep `HOST=127.0.0.1` for local development.
2. Keep Gatus dynamic configuration disabled.
3. Use only administrator-approved, authorized endpoints; do not make endpoint creation public.
4. Do not claim Gatus reload/history behavior, live OmniRoute compatibility, external notification delivery, or real 24-hour availability based on the current audit.
5. Before internet deployment, add and verify network egress controls, TLS termination, backup/restore, and a real authorized staging endpoint test plan.
