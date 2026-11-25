# Third-party notices

This inventory records direct runtime dependencies observed in the installed lockfile environment on 2026-11-25. The package lockfiles and upstream package metadata remain authoritative, including for transitive dependencies.

## Gatus

StackPulse's Compose configuration references `ghcr.io/twin/gatus:stable` as an optional internal monitoring engine. Gatus is copyright TwiN and contributors and is licensed under the Apache License, Version 2.0.

- Project: https://github.com/TwiN/gatus
- License: https://github.com/TwiN/gatus/blob/master/LICENSE
- Existing attribution: [NOTICE](NOTICE)

The Docker Engine was unavailable during this audit. The installed Gatus version and image digest were not captured, and the `stable` tag is mutable. No claim is made about the exact image currently represented by that tag. Capture the immutable digest and retain the upstream license/notice when distributing or deploying the image.

StackPulse does not include Gatus source code in this repository. It reuses the engine as an optional internal service and implements its own read-only API/configuration adapter. Native Node.js checks and StackPulse SQLite remain authoritative.

## Direct backend runtime dependencies

Observed package license identifiers:

- MIT: `axios`, `bcryptjs`, `better-sqlite3`, `cors`, `express`, `express-rate-limit`, `helmet`, `ipaddr.js`, `jsonwebtoken`, `winston`, `zod`.
- BSD-2-Clause: `dotenv`.
- ISC: `yaml`.

## Direct frontend runtime dependencies

Observed package license identifiers:

- MIT: React, React DOM, React Router, Radix UI packages, `axios`, `clsx`, `date-fns`, `recharts`, `tailwind-merge`, `tailwindcss-animate`, and `zustand`.
- ISC: `lucide-react`.
- Apache-2.0: `class-variance-authority`.

The complete direct dependency versions are recorded in `backend/package-lock.json` and `frontend/package-lock.json`. Check each package's license and include applicable notices for the complete transitive dependency closure before redistribution.

## StackPulse application code

The repository does not currently include a root `LICENSE` file. No license for StackPulse application code is asserted by this notice or README.
