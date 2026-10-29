# VigiCore NEXUS — API du site (`nexus-api`)

Express + TypeScript + Prisma. Port **4000**. Consommée par le `frontend` (proxy Vite `/api`).

## Lancer
```bash
cp .env.example .env        # JWT_SECRET, AUDIT_BASE_URL, NEXUS_SERVICE_JWT_SECRET, ATTACHMENT_ENC_KEY…
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed                # + démo (dev uniquement) : npm run seed:demo
npm run dev
```
Tests : `npm test` · Typage : `npm run typecheck`

### Base PostgreSQL (production)
`prisma/postgres/schema.prisma` est synchronisé avec le schéma SQLite. Les migrations PostgreSQL
(`prisma/postgres/migrations`) ne contiennent que la ligne de base : avant la mise en production,
générez la migration des tables ajoutées depuis, sur une base PostgreSQL de travail :
```bash
npx prisma migrate dev --schema prisma/postgres/schema.prisma --name sync_with_sqlite
```

## Structure
```
src/
  server.ts / boot.ts / app.ts   démarrage, config, montage des routes
  routes/      *.routes.ts — une route par domaine (/api/auth, /api/declarations, /api/vigilance, /api/records,
               /api/personal = données personnelles du tableau de bord : produits, traitements, prises,
               rendez-vous, allergies, maladies, contacts d'urgence, profil patient, profil laboratoire…)
  services/    logique métier (soumissions, CNPM, pièces jointes, assistant, paiements…)
  auth/        autorisation allow() + matrice rôles/permissions
  middleware/  requireAuth, requirePlatformAdmin
  lib/         config, prisma, jwt, email, sécurité, client Audit
prisma/
  schema.prisma            schéma SQLite (dev)
  postgres/schema.prisma   schéma PostgreSQL (prod) — doit rester synchronisé : node scripts/check-schema-sync.mjs
  migrations/              migrations SQLite
scripts/       utilitaires (listes, migration SQLite → PostgreSQL)
test/          tests vitest
storage/       pièces jointes chiffrées (local, non versionné)
```
Notes de conception de la couche d'autorisation : `docs/PHASE1-AUTHZ.md`.
