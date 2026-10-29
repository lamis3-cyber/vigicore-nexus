# VigiCore — NEXUS & Audit

Plateforme de vigilance des produits de santé (matériovigilance) : site public + tableaux de bord **VigiCore NEXUS**, logiciel des organisations **VigiCore Audit**, et un **service d'IA**.

## Architecture

```
vigicore/
├── frontend/                 Interface React (Vite)                         :5176
│
├── backend/
│   ├── nexus-api/            API du site — Express + TypeScript + Prisma    :4000
│   └── audit-api/            API VigiCore Audit — Express + PostgreSQL      :5100
│
├── ai-service/               Service d'IA + VigiBot — FastAPI (Python)      :8000
│
├── database/backups/         Sauvegardes SQL
├── docs/                     Déploiement, sécurité, exploitation, historique
├── scripts/                  Sauvegarde / test de restauration
├── docker-compose.dev.yml    PostgreSQL (:5433) + Redis (:6379) pour le dev
├── docker-compose.prod.yml   Production : PostgreSQL + nexus-api + frontend (Caddy, HTTPS)
└── package.json              Raccourcis (npm run dev:frontend, dev:nexus-api…)
```

```
Navigateur ──> frontend (5176) ──/api──> nexus-api (4000) ──JWT de service──> audit-api (5100) ──> ai-service (8000)
                                              │                                     │                  │
                                         SQLite (dev)                          PostgreSQL            Redis
                                      PostgreSQL (prod)                         (5433)
```

Chaque service est **indépendant** : ses propres dépendances, son `.env`, son `Dockerfile` et son `README.md`.

## Prérequis
Node 22 · Python 3.12 · Docker

## Démarrage (développement)

**1. Bases de données**
```bash
npm run db:up            # = docker compose -f docker-compose.dev.yml up -d
```

**2. Restaurer les données Audit (une seule fois)**
```bash
grep -v '^\\restrict\|^\\unrestrict' database/backups/database_backup_20260914.sql > /tmp/restore.sql
docker exec -i materio_postgres psql -U materio_user -d materiovigilance < /tmp/restore.sql
```

**3. audit-api (port 5100)**
```bash
cd backend/audit-api
cp .env.example .env     # renseigner JWT_SECRET, NEXUS_SERVICE_JWT_SECRET (openssl rand -hex 32)
npm install && npx prisma generate && npx prisma migrate deploy
node scripts/create-nexus-gateway-user.js   # copier l'id dans NEXUS_GATEWAY_USER_ID
npm run dev
```

**4. ai-service (port 8000)**
```bash
cd ai-service
cp .env.example .env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**5. nexus-api (port 4000)**
```bash
cd backend/nexus-api
cp .env.example .env     # JWT_SECRET, AUDIT_BASE_URL=http://localhost:5100,
                         # NEXUS_SERVICE_JWT_SECRET = la MÊME valeur que dans audit-api
npm install && npx prisma generate && npx prisma migrate deploy
npm run seed
npm run dev
```

**6. frontend (port 5176)**
```bash
cd frontend
npm install
npm run dev
```
→ http://localhost:5176

## Ports

| Service      | Port | Config                                   |
|--------------|------|------------------------------------------|
| frontend     | 5176 | `frontend/vite.config.js`                |
| nexus-api    | 4000 | `backend/nexus-api/.env` → `PORT`        |
| audit-api    | 5100 | `backend/audit-api/.env` → `PORT`        |
| ai-service   | 8000 | `ai-service/.env` → `PORT`               |
| PostgreSQL   | 5433 | `docker-compose.dev.yml` (`POSTGRES_PORT`) |
| Redis        | 6379 | `docker-compose.dev.yml`                 |

## Tests
```bash
npm run test:nexus-api           # vitest (API du site)
npm run test:audit-api           # node:test (API Audit)
cd frontend/tests-ui && npm install && npm test   # composants (jsdom)
```

## Production
Voir `docs/DEPLOYMENT.md` (section 0 : mise en ligne rapide) et `docs/OPERATIONS.md`.
```bash
cp .env.production.example .env.production && bash scripts/check-env-prod.sh
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build                  # Site
docker compose -f docker-compose.prod.yml --env-file .env.production --profile audit up -d --build  # + Audit + IA
```
> `backend/audit-api` n'est pas inclus dans cette archive : l'ajouter avant d'utiliser `--profile audit`
> (sans lui, le Site fonctionne et garde les déclarations en attente d'envoi).

## Documentation
- `docs/DEPLOYMENT.md` — déploiement · `docs/OPERATIONS.md` — sauvegardes/restauration
- `docs/SECURITY.md`, `docs/PRIVACY-REVIEW.md` — sécurité et données personnelles
- `docs/ASSISTANT.md` — assistant du tableau de bord
- `backend/audit-api/docs/NEXUS-INTAKE.md` — contrat Site → Audit
- `docs/CHANGELOG-patches.md` — historique des correctifs
