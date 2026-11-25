# StackPulse five-minute demonstration

## Before the demo

- Use the Windows startup steps in [README.md](../README.md); keep both backend and frontend terminals running.
- Use an administrator account and a staging endpoint you own or are explicitly authorized to monitor.
- Prepare a controlled endpoint that can switch between the expected HTTP 200 response and HTTP 503. Do not use an arbitrary third-party endpoint or localhost; local/private targets are blocked.
- Gatus is optional and should remain off for this demo. Do not seed or invent monitoring history.
- If no authorized controllable endpoint is available, demonstrate the empty/unknown states and deterministic test results honestly; do not claim a live outage cycle.

## Run of show

### 0:00–0:45 — Establish live state

1. Open the dashboard and show the native engine health and endpoint count.
2. Explain that no endpoint means uptime is unavailable, not 100%, and that missing monitoring data is not displayed as healthy.

### 0:45–1:30 — Add a real authorized service

1. Open **Endpoints → Add endpoint**.
2. Enter the staging service URL, expected status `200`, interval `30 seconds`, and optionally enable its public status page.
3. Save. Show the real latest HTTP status, latency, timestamp, and the first scheduled result. Distinguish observed uptime from monitoring coverage.

### 1:30–3:15 — Create and inspect an incident

1. Change the controlled staging endpoint to return HTTP 503.
2. Wait for three consecutive scheduled failures (allow at least 90 seconds at a 30-second interval, plus scheduling tolerance).
3. Show the single active incident, its timeline and observed evidence, and the two simulated notification records (email and webhook). State clearly that no external message was delivered.
4. Review deterministic IncidentLens causes, troubleshooting steps, and evidence limitations. If AI is disabled/unavailable, show the deterministic fallback; do not imply a live model response.

### 3:15–4:15 — Recover

1. Restore the staging service to HTTP 200.
2. Wait for the next scheduled successful check.
3. Show that the same incident resolves, the recovery event is appended, and the simulated recovery notification records appear.

### 4:15–5:00 — Public status and trust

1. Open the endpoint's public status link in a logged-out tab.
2. Show that its URL and private failure details are absent, and that status, last update, observed uptime, coverage, and 24-hour persisted history are separate.
3. Close the public tab while leaving the backend terminal open; explain that monitoring runs in the backend process, not in the browser.
4. Close with the limitations: Gatus and OmniRoute were not live-validated; AI is optional; simulated notifications are not delivery; a high observed uptime with low coverage is not proof of uninterrupted availability.

## Evidence discipline

Use the live staging endpoint's actual responses and timestamps. Do not manually insert checks, label fixture results as live, or claim global outage confirmation from one monitoring location.
