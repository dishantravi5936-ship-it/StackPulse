# StackPulse Phase 1.5 — Frontend Runtime Validation

**Date:** 2026-11-26  
**Scope:** Existing React/Vite user workflows, API integration, polling, error states, responsive rendering and post-fix builds

## Environment and baseline

- Frontend: Vite development server on `127.0.0.1:5173`, proxying `/api` to the backend at `localhost:3001`.
- Backend: Express bound to `127.0.0.1:3001`, using native monitoring; Gatus dynamic checks were disabled.
- Runtime validation used a newly created temporary SQLite database and a process-only JWT secret. Existing `.env` files and application databases were not used or overwritten.
- Backend startup completed migrations and reported the database healthy and native monitoring available.
- The temporary test administrator was seeded through the actual registration API. A regular test account was then registered through the UI.
- Baseline before the UI changes: 56 backend tests passed across 7 suites; backend and frontend production builds passed.

## Browser workflow results

| Workflow/state | Result | Evidence and limits |
|---|---|---|
| Landing page and public navigation | PASS | Rendered StackPulse value proposition, sign-in/register links and public status link. |
| Registration | PASS | Registered a regular user through `/register`; UI redirected to `/dashboard`. |
| Login and invalid credentials | PASS | Previously exercised with the live API; invalid credentials showed an error and successful admin/user login reached the dashboard. |
| Logout and protected navigation | PASS | Previously signed out and confirmed direct navigation to `/dashboard` redirected to login. Expired-token behavior was not separately exercised in the browser. |
| Dashboard loading and empty state | PASS | Fresh isolated database showed zero endpoints/incidents, unavailable uptime/coverage (`—`), native engine status and no fabricated results. |
| Ordinary-user endpoint controls | PASS | Reconfirmed after the change: the empty dashboard shows no “Add endpoint” action; the Endpoints page explains that an administrator must share endpoints. |
| Endpoint create/edit/detail | PARTIAL | Earlier live UI testing created and edited an endpoint, opened its detail page, and displayed real HTTP 200, latency, TrustPulse, history/chart and TLS information. Local/private destinations were correctly rejected. |
| Endpoint edit form initialization | PASS | Editing populated the selected endpoint’s current name, URL, expected values and interval. The fix resets fields when the dialog opens or its endpoint changes. |
| Endpoint pause/resume and deletion | NOT FULLY VERIFIED IN BROWSER | Backend integration tests cover pause/resume/archive. The frontend pause/resume interactions and delete-confirmation-to-completion sequence were not captured as a complete browser workflow in this phase. |
| Incident details and deterministic IncidentLens | PASS / PARTIAL | Existing incident detail rendered its persisted timeline and deterministic troubleshooting guidance. A fresh frontend-driven failure-to-incident-to-recovery sequence was not run. |
| Notification history | PASS | Rendered the actual empty state for the isolated account; no sample notifications were substituted. |
| Public status page | PASS | Public page rendered its actual empty/degraded state without exposing private endpoint details. |
| Themes | PASS | Dark/light theme controls were present and exercised in the earlier browser run. |
| API unavailable | PASS | With the backend intentionally stopped during the earlier run, the UI displayed a request error rather than fabricated data. The observed API requests returned HTTP 500 while the backend was unavailable. |
| Monitoring unavailable / stale or paused states | PARTIAL | Backend TrustPulse evidence and page labels were reviewed, but not every state was driven through a separate frontend browser scenario. |
| Removed AI functionality | PASS | No AI explanation control appeared in tested incident views; the Phase 1.1 source trace removed AI routes and integration. |

### Polling

Browser resource timing previously showed three dashboard API requests across approximately 16.5 seconds, consistent with the 15-second polling interval. The hook at `frontend/src/hooks/usePolling.ts` uses a timeout-based schedule, prevents overlapping requests, and clears the pending timer on unmount. Timer cleanup is source-confirmed; an explicit unmount instrumentation test was not run.

## Responsive and visual validation

Earlier viewport spot-checks recorded no horizontal overflow at 360×800, 390×844, 768×1024, 1280×720 and 1920×1080. The current integrated-browser screenshot at its narrow default viewport showed a horizontal scrollbar and clipped left-edge content. The browser tools available in this run did not expose viewport resizing or DOM scroll-width measurements, so I could not reproduce the five configured dimensions or identify the exact overflowing element. Treat small-screen overflow as **unresolved**, not as a verified pass.

A dashboard screenshot was captured in the integrated browser, but the tool did not provide a repository file path; no screenshot file was added.

Console inspection was not available through the browser tools used. The known HTTP 500 responses occurred only during the intentional backend-offline test; no claim is made that the browser console was otherwise error-free.

## Changes

- `frontend/src/pages/DashboardPage.tsx`: only administrators see the empty-dashboard “Add endpoint” CTA, matching the backend’s administrator-only mutation policy.
- `frontend/src/components/EndpointForm.tsx`: initializes form values from the selected endpoint when the edit dialog opens or the endpoint changes, rather than retaining stale/blank state.
- `docs/PHASE_1_5_FRONTEND_VALIDATION.md`: records browser evidence, incomplete workflows and responsive limitations.

No monitoring semantics, backend authorization, database schema or AI functionality was changed in this phase.

## Final validation

Executed after the UI changes:

- Backend: `npm test -- --runInBand` — **7 suites passed, 56 tests passed**.
- Backend: `npm run build` — **passed**.
- Frontend: `npm run build` — **TypeScript check and Vite production build passed**.

Test count was unchanged; no AI-specific tests were removed during Phase 1.5.

## Remaining blockers

1. Re-run responsive checks with an instrumented browser at the specified viewport sizes and resolve the narrow viewport horizontal scrollbar if confirmed.
2. Capture complete frontend pause/resume and delete-confirmation workflows.
3. Exercise an endpoint failure and recovery through the browser, including resulting incident and notification views.
4. Verify expired-token behavior and frontend polling cleanup dynamically.
5. Browser console inspection was unavailable; use browser developer tools or an automated browser harness before treating console cleanliness as verified.

Phase 1.5 is **partially complete**: the targeted UI fixes, builds and core browser flows passed, but the items above remain unverified.
