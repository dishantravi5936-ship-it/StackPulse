# StackPulse

Developer-first uptime monitoring and public status pages for AVISHKAR'26.

StackPulse uses a React/Vite frontend, an Express/TypeScript API, SQLite, and an authoritative native Node.js monitor. Gatus is an optional internal component; its runtime integration is not validated and it is not required for local development.

## Windows quick start

### Requirements

- Node.js 22 or later and npm. The audit environment used Node.js 24.15.0 and npm 11.12.1.
- Docker Desktop only if you choose to try the optional Gatus integration.
- PowerShell.

### 1. Configure secrets

From the repository root:

```powershell
if (-not (Test-Path 'backend\.env')) {
  Copy-Item 'backend\.env.example' 'backend\.env'
}
notepad 'backend\.env'
```

Set `JWT_SECRET` and a temporary `ADMIN_BOOTSTRAP_TOKEN` to different, unique random values of at least 32 characters. Generate values locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not overwrite an existing `backend\.env` blindly or commit it. The API binds to `127.0.0.1` by default. Keep the bootstrap token only until the first administrator account has been created.

### 2. Start the backend

In a PowerShell terminal:

```powershell
Set-Location E:\StackPulse\backend
npm ci
npm run dev
```

The backend API is at `http://127.0.0.1:3001`; health is at `http://127.0.0.1:3001/api/health`. Keep this process running while monitoring. Closing the browser does not stop the backend worker; closing the backend terminal does.

### 3. Start the frontend

In a second PowerShell terminal:

```powershell
Set-Location E:\StackPulse\frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Register the first account at `/register` and enter the bootstrap token; that account becomes the administrator. Remove `ADMIN_BOOTSTRAP_TOKEN` from `backend\.env` and restart the backend after registration. No default account or monitoring history is seeded.

### 4. Add an authorized endpoint

Only add services you own or are explicitly authorized to monitor. Endpoint mutations require an administrator. The native worker makes real requests; private/loopback destinations and redirects are rejected/not followed. Do not use a third-party public URL as a test target without authorization.

The frontend is served from `/`, the public aggregate status page is `/status`, and approved endpoint pages are linked from that page. Public status responses intentionally omit endpoint URLs and private diagnostic details.

## Optional Gatus

Gatus is not required for the native monitor or local demo. Docker Engine was unavailable during validation, so Gatus startup, live API shape, reload, history persistence, and interruption recovery remain unverified. If Docker Desktop is running and you intentionally want to try it:

```powershell
Set-Location E:\StackPulse
docker compose up -d gatus
```

Dynamic Gatus configuration is disabled by default. Do not enable it as a production monitoring path until its egress restrictions and runtime behavior have been independently verified. See [docs/GATUS_VALIDATION.md](docs/GATUS_VALIDATION.md).

## Monitoring behavior and limitations

- Scheduled intervals are 30, 60, or 120 seconds.
- Observed uptime is calculated from completed scheduled checks only. Monitoring coverage is reported separately; missing checks are unknown, not successful.
- Three consecutive scheduled failures open one incident. A successful scheduled check resolves it; missing results do not.
- Email and webhook notifications are simulated records, not external deliveries.
- TLS expiry/issuer/CN come from the bounded native TLS inspector. Unavailable metadata is represented as unavailable.
- Optional AI explanations are disabled unless explicitly configured against a verified local OmniRoute endpoint and free model. AI is not used in availability or incident decisions.
- No live authorized external monitoring target, live OmniRoute endpoint, or live Gatus engine was available in the audit. Do not present test fixtures as production monitoring evidence.

## Checks

From the repository root:

```powershell
Set-Location E:\StackPulse\backend
npm test
npm run build

Set-Location E:\StackPulse\frontend
npm run build
```

At audit time the backend lint script could not find ESLint, and the frontend ESLint installation had no configuration file; lint results are therefore unavailable, not passing. See [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Project documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/BACKEND_API.md](docs/BACKEND_API.md)
- [docs/GATUS_VALIDATION.md](docs/GATUS_VALIDATION.md)
- [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)
- [docs/SECURITY_LIMITATIONS.md](docs/SECURITY_LIMITATIONS.md)
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- [docs/ORIGINAL_CONTRIBUTIONS.md](docs/ORIGINAL_CONTRIBUTIONS.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## Licensing

The repository does not currently contain a root `LICENSE` file, so this README does not claim that StackPulse application code is MIT-licensed. Gatus is licensed under Apache License 2.0; see [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
