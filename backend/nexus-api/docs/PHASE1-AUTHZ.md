# VigiCore NEXUS — Backend

## Phase 2 update: auth + services API now implemented

The gap this README used to describe ("no HTTP API routes... session-context
endpoint... Phase 2 scope") is closed for the auth + services slice:

- `POST /api/auth/signup`, `/login`, `/logout`, `GET /api/auth/session` —
  session cookie is a JWT (`vg_session`, httpOnly), matching the contract in
  `../src/lib/auth.js`. Passwords are bcrypt-hashed (`passwordHash` added to
  `User` in `prisma/schema.prisma`).
- `GET/POST/PUT/DELETE /api/services...` — full CRUD for `ProductListing`,
  authorized through the existing `src/auth/servicesAuthz.ts` (unchanged),
  matching the contract in `../src/lib/services.js`.
- `establishment_admin` signup (organization registration) is handled by
  this same `/api/auth/signup` route but is only ever sent by the dedicated
  `RegisterOrganizationPage.jsx` flow — not the public multi-role sign-up
  form, which still only offers the five individual/clinical roles.

Still out of scope: MFA (`/api/auth/mfa/verify` is a 501 stub),
password-reset emails (the route responds success but sends nothing), and
everything Declaration/Case/wizard-related (`allow.ts` / `rolePermissions.ts`
are untouched and still have no route calling them yet).

### Running the API

```bash
npm install
cp .env.example .env      # set a real JWT_SECRET; SQLite needs no other config
npx prisma generate
npx prisma migrate dev --name add_password_and_phase2
npm run dev                # starts the API on :4000 (see PORT in .env)
```

The frontend's `VITE_API_URL` (see its own `.env`) should point at this
server, e.g. `http://localhost:4000/api`, and `CORS_ORIGIN` here must match
the frontend's exact dev origin (default assumed: `http://localhost:5176`).

---

# Phase 1: Foundation schema & authorization layer (original)

This directory is **new and additive**. It does not replace, modify, or depend on
anything in the existing `src/`, `public/`, or root Vite config of the frontend
repository. The frontend's existing `/api/auth/*` contract (`src/lib/auth.js`)
is untouched and continues to point at whatever backend currently serves it —
this service does not (yet) implement authentication endpoints; that remains
explicitly out of scope per the locked architecture (Phase 2+).

## Scope of this phase

Implements exactly what the locked architecture specifies for Phase 1:
- Establishment / Department schema
- User ↔ Establishment many-to-many affiliation
- Roles, including Vigilance Reviewer and Establishment Admin
- Declaration schema
- Case schema (1 Declaration → 0..1 Case)
- Reserved central-queue establishment (seed data)
- The corrected AND-based authorization rule: `role_permits AND
  action_permitted_for_role AND scope_established AND
  org_department_boundary_ok`
- Department modeled as a default scope/filter, not hard isolation
- Multi-tenant single-instance schema shape (`establishmentId` on every
  scoped table)
- No standing cross-establishment access (only via explicitly-scoped grants)
- Payload sensitivity-tagging contract (enforcement deferred)

Explicitly **not** in this phase: session-context endpoint, wizard
configuration/engine, any HTTP API routes, dashboard queries, or additional
`(domain, role)` combinations. See the locked architecture document for the
Phase 2–5 plan.

## Setup

```bash
npm install
cp .env.example .env      # SQLite by default, no external DB needed
npx prisma generate
npx prisma migrate dev --name init
npm run seed               # creates the reserved central-queue establishment
npm test                   # runs the authorization layer test suite
```

> **Known limitation in the current sandboxed session only:** `prisma
> generate` / `migrate dev` require downloading engine binaries from
> `binaries.prisma.sh`, which is not reachable under this session's network
> egress allowlist. In a normal development/CI environment (unrestricted
> outbound HTTPS, which is the default for Prisma), the commands above work
> as-is. The authorization layer (`npm test`) has **no dependency on the
> Prisma runtime** and passes independently of this limitation — see the
> implementation report for full detail.

## Directory structure

```
server/
├── prisma/
│   ├── schema.prisma      # Phase 1 data model, heavily annotated with
│   │                        which locked decision each field encodes
│   └── seed.ts             # creates the reserved central-queue establishment
├── src/
│   ├── auth/
│   │   ├── types.ts         # RequesterContext, ScopedRecord, PermissionGrant
│   │   ├── rolePermissions.ts  # role -> action matrix (Decision 2)
│   │   ├── allow.ts          # the allow() authorization entry point
│   │   └── index.ts           # barrel export
│   └── types/
│       └── payload.ts          # sensitivity-tagged Declaration payload contract
└── test/
    └── allow.test.ts             # 17 tests covering every locked decision
```

## Using `allow()` in a future phase

`allow()` is the single authorization entry point every future consumer
(wizard submission handler, dashboard query, any API route) must call
through — it is intentionally framework/transport-agnostic so it can be
unit-tested without any HTTP or database dependency, and reused identically
regardless of what triggers the check.

```ts
import { allow } from './src/auth';

const canView = allow(requesterContext, 'VIEW', declarationRecord);
```

Building the `RequesterContext` from an actual authenticated session is
Phase 2 scope (session-context endpoint). Wiring `allow()` into real API
routes is Phase 3 scope (vertical slice).
