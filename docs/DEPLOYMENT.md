# Déploiement (production)

## 0. Mise en ligne rapide (VPS Linux + Docker)
Serveur conseillé : 2 vCPU / 4 Go RAM (8 Go+ si Ollama), Docker + plugin compose ≥ 2.24, ports 80/443 ouverts,
un nom de domaine dont l'enregistrement DNS A pointe vers l'IP du serveur.
```bash
cp .env.production.example .env.production      # remplir toutes les valeurs (openssl rand -hex 32 pour les secrets)
bash scripts/check-env-prod.sh                  # (--audit pour la plateforme complète) : rien d'obligatoire ne manque
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
#   plateforme complète (backend/audit-api requis) : ajouter --profile audit
docker compose -f docker-compose.prod.yml logs -f api   # « prisma migrate deploy » + seed, puis « listening on port 4000 »
curl https://VOTRE-DOMAINE/health/ready                 # {"success":true}
```
Au démarrage, le conteneur `api` applique les migrations PostgreSQL et le seed (idempotents, `backend/nexus-api/docker-entrypoint.sh` ;
`RUN_MIGRATIONS=false` pour les désactiver). Restaurer les données Audit (profil `audit`, une seule fois) :
`grep -v '^\\restrict\|^\\unrestrict' database_backup_20260914.sql | docker compose -f docker-compose.prod.yml exec -T audit-db psql -U materio_user -d materiovigilance`.

Architecture : **Caddy** (HTTPS automatique, sert le SPA, proxy `/api`) → **API Node** (1 instance) → **PostgreSQL**. Le fichier
`docker-compose.prod.yml` assemble le tout. Rien ici ne suppose un hébergeur précis. Statut de vérification : voir la dernière section.

## 1. Valeurs à fournir par le propriétaire (rien n'est inventé)
`.env.production` (jamais commité ; modèle : `backend/nexus-api/.env.example`) :
`JWT_SECRET` (openssl rand -hex 32), `POSTGRES_*`, `SITE_ADDRESS`, `CORS_ORIGIN`, `APP_BASE_URL`, `PLATFORM_ADMIN_EMAILS` (vraies adresses),
`SMTP_*` + `MAIL_FROM` + `CONTACT_TO`, `PAYMENT_BENEFICIARY` + `PAYMENT_CCP_ACCOUNT`/`PAYMENT_BANK_RIB`, `INVOICE_SELLER_NAME/ADDRESS/NIF/RC/NIS`,
`ANTHROPIC_API_KEY`, `BRIA_API_TOKEN`, `TURN_*`, `AUDIT_BASE_URL` + `NEXUS_SERVICE_JWT_SECRET` (identique côté Audit).
Variables de build du SPA (`.env.example` racine) : `SITE_URL`, `VITE_LEGAL_*`.
Au démarrage, `NODE_ENV=production` **refuse de démarrer** (exit 1, noms de variables uniquement) si : secret absent/placeholder/<32 car., SQLite, CORS non https,
adresse admin de démonstration, `APP_BASE_URL` non https. Les fonctions dont la config manque répondent **503** (reset mot de passe, contact, factures) au lieu de simuler.

## 2. Migration SQLite → PostgreSQL (sans perte, sans écraser)
1. **Sauvegarder** : copie du fichier SQLite (`cp dev.db dev.db.pre-migration`, hors dépôt) — la migration ne le modifie pas (ouverture en lecture seule).
2. Créer la base PostgreSQL vide, puis `cd backend/nexus-api && DATABASE_URL=postgresql://… npx prisma migrate deploy --schema prisma/postgres/schema.prisma`.
3. `python3 scripts/migrate_sqlite_to_postgres.py --sqlite prisma/dev.db --pg "postgresql://…" --dry-run` puis sans `--dry-run`.
   Le script refuse une cible non vide, copie en **une transaction**, compare les comptages par table et fait ROLLBACK au moindre écart.
4. Basculer `DATABASE_URL`, démarrer, vérifier `/health/ready`. Conserver la sauvegarde SQLite tant que la production n'est pas validée.
`prisma/postgres/schema.prisma` doit rester identique au schéma SQLite (hors `provider`) : `node backend/nexus-api/scripts/check-schema-sync.mjs` (CI).

## 3. Une seule instance d'API
L'état de signalisation des appels (`clients` dans `call.routes.ts`) et les limiteurs de débit sont **en mémoire du processus**. Plusieurs instances
casseraient les appels (le pair connecté sur une autre instance ne reçoit rien) et multiplieraient les quotas. Pour passer à l'échelle : Redis (pub/sub + store des limiteurs)
et fichiers de chat sur un stockage objet. Le renvoi des déclarations est idempotent côté Audit (clé = id de soumission) : deux instances ne créeraient pas de doublon.

## 4. Proxy, SSE, stockage
- `frontend/deploy/Caddyfile` : `flush_interval -1` et timeouts désactivés sur `/api` (SSE `/api/call/stream` : ping toutes les 20 s, `retry: 3000`, `X-Accel-Buffering: no`).
  Variante Nginx : `proxy_buffering off; proxy_read_timeout 3600s; proxy_http_version 1.1; proxy_set_header Connection "";` sur `location /api/call/stream`.
- `TRUST_PROXY=1` (un seul proxy). Sans proxy, laisser vide.
- Fichiers de chat : volume persistant monté sur `STORAGE_DIR` (`/data/storage`), **inclus dans les sauvegardes**.
- SPA : COOP `same-origin` + COEP `credentialless` (nécessaires au WASM multithread du détourage), CSP sans `unsafe-inline` pour les scripts : les hachages des scripts inline
  sont calculés au build (`dist/csp-script-hashes.txt`). `.wasm`/modèles : cache immuable, gzip transparent (octets identiques après décompression).

## 5. CI
`.github/workflows/ci.yml` : typecheck + tests serveur, `npm audit` (prod, niveau high), build SPA, cohérence des schémas.

## 6. Ce qui a été vérifié ici / pas vérifié
**Passe pré-hébergement (2026-10-29)** — vérifié sur un vrai PostgreSQL 16 : la chaîne `prisma/postgres/migrations` complète (avec
`20261105990000_sync_with_sqlite`) donne exactement le schéma de `prisma/postgres/schema.prisma` ; API démarrée en `NODE_ENV=production`
sur cette base, parcours HTTP (inscription, connexion, préférences, brouillons, assistant, dossiers, déclarations, marché) sans erreur ;
`docker compose config` (Site seul et `--profile audit`) ; `caddy validate` ; 707 tests API, 198 tests UI, build du SPA.
Toujours non vérifié faute de Docker : `docker build` / `up` réels et le certificat Let's Encrypt.

Historique :
Vérifié : Caddyfile valide (`caddy validate`) ; en-têtes, repli SPA, `/dashboard/`, wasm identique, SSE progressif (ping à 0,44 s, 0,84 s…) à travers un vrai Caddy 2.8.4 contre une API factice ;
baseline PostgreSQL appliquée sur un vrai PostgreSQL ; migration de données (copie de `dev.db`, 21 utilisateurs) avec dry-run, refus de cible non vide et source inchangée ;
sauvegarde + rétention + test de restauration.
**Non vérifié (pas de Docker ni d'hébergeur dans l'environnement)** : `docker build`, `docker compose up`, obtention de certificat Let's Encrypt, `prisma migrate deploy` avec le moteur Prisma 6
(le moteur n'est pas téléchargeable depuis le bac à sable : le DDL de référence a été généré avec Prisma 5.22 et appliqué tel quel), exécution de l'API complète sur PostgreSQL.
