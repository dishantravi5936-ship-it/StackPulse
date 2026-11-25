# StackPulse

> **Developer-first uptime monitoring & public status page — AVISHKAR'26**

Built with React, TypeScript, Node.js, SQLite, and [Gatus](https://github.com/TwiN/gatus) (Apache 2.0).

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Recharts |
| Backend | Node.js + Express + TypeScript + better-sqlite3 + JWT + Zod + Winston |
| Monitoring | Native Node.js checks; optional Gatus (TwiN/gatus, Apache 2.0) — read-only engine |
| Database | SQLite — single file, zero config |

---

## Quick Start

### 1. Prerequisites
- Node.js ≥ 18
- Docker Desktop (for Gatus)

### 2. Configure environment
```powershell
copy backend\.env.example backend\.env
# Set JWT_SECRET and ADMIN_BOOTSTRAP_TOKEN to unique random values of at least 32 characters
```

### 3. Start Gatus (optional; integration remains unvalidated)
```powershell
docker compose up -d gatus
```

### 4. Install & run backend
```powershell
cd backend
npm install
npm run dev
```
Backend → http://localhost:3001  
Health check → http://localhost:3001/api/health

No default credentials are created. Register the first administrator using the bootstrap token configured in `backend\.env`:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/auth/register `
  -ContentType 'application/json' `
  -Body '{"email":"you@example.test","password":"<use-a-unique-12-character-or-longer-password>","bootstrapToken":"<ADMIN_BOOTSTRAP_TOKEN>"}'
```

Remove `ADMIN_BOOTSTRAP_TOKEN` from the backend environment after first registration. The first account is an administrator; subsequent registrations have the regular user role. See [docs/BACKEND_API.md](docs/BACKEND_API.md) for all backend routes and authorization behavior.

### 5. Install & run frontend
```powershell
cd frontend
npm install
npm run dev
```
Frontend → http://localhost:5173  
Status page → http://localhost:5173/status  
Admin login → http://localhost:5173/login

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Gatus Integration Notes

See [docs/GATUS_VALIDATION.md](docs/GATUS_VALIDATION.md) — includes what was tested, what failed, source-derived (not live-verified) API fields, and remaining validation gates.

## Implementation Plan

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

---

## Project Structure

```
StackPulse/
├── frontend/        React + Vite + Tailwind
├── backend/         Express + SQLite API
├── monitoring/
│   ├── config/      Gatus config.yaml
│   └── data/        Gatus SQLite storage (gitignored)
├── docs/            Architecture + validation docs
├── AGENTS.md        Dev conventions & AI guidance
└── docker-compose.yml
```

---

## License

StackPulse application code — MIT  
Gatus (TwiN/gatus) — Apache License 2.0 — used as internal monitoring engine
