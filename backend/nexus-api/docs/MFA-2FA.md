# VigiCore (SITE) — 2FA TOTP opt-in — sous-étape 2a (backend)

Légende : [EXÉC] exécuté · [LU] lu · [?] non vérifié. `audit-api` et le Logiciel : non touchés, non consultés.
**Livré : backend complet. Non livré : interface = sous-étape 2b** (voir ci-dessous). Changements additifs ; sans `MFA_ENABLED=true`, le comportement est STRICTEMENT celui d'avant.

## Fichiers (même arborescence que `vigicore-clean/`)
**Remplacés (modifiés)** : `backend/nexus-api/` → `prisma/schema.prisma` et `prisma/postgres/schema.prisma` (+3 modèles, identiques hors provider) · `src/routes/auth.routes.ts` (login, `/mfa/verify`, `/session`, montage de `/2fa`) · `src/lib/jwt.ts` (durcissement, 3 lignes) · `.env.example` (+4 variables) · `package.json` et `package-lock.json` (+`otplib` 13.5.0, +`qrcode` 1.5.4, +`@types/qrcode`).
**Ajoutés** : `src/lib/mfaCrypto.ts` · `src/services/mfa.ts` · `src/routes/mfa.routes.ts` · `prisma/migrations/20261101090000_user_mfa/migration.sql` · `prisma/postgres/migrations/20261101090000_user_mfa/migration.sql` · `test/mfa.test.ts` (23 tests).

## Variables d'environnement
`MFA_ENABLED` (défaut **false**) · `MFA_ENCRYPTION_KEY` (32 octets en base64 ; génération : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` ; ne jamais committer) · `MFA_MAX_FAILURES` (5, plage 3-20) · `MFA_LOCK_MINUTES` (15, plage 1-1440).
Clé absente/invalide : setup/enable/régénération refusés (503) et un compte qui a déjà le 2FA reçoit 503 au login (**jamais de contournement**). Je refuse aussi hors production (pas de mode « dev » non sécurisé).

## Conception
- **Base : 3 nouvelles tables SANS clés étrangères** (`UserMfa`, `UserMfaRecoveryCode`, `MfaChallengeUse`) plutôt que des colonnes sur `User` : la table `User` reste intacte (zéro risque pour le login existant), la migration Postgres est autonome sur la chaîne actuelle, retour arrière = ne plus s'en servir. **Dépendance Postgres** : pour **migrer**, aucune (`User` n'est pas touchée) ; pour **fonctionner**, `AuditEntry` (écritures d'audit à l'activation/désactivation/régénération) vient de `sync_with_sqlite` (voir ETAPE1-LISEZ-MOI.md). Sans cette table, l'activation du 2FA échoue (500) : fail closed.
- **TOTP** : `otplib` 13.5.0 (ligne maintenue ; build CJS, Node 22 de l'image) ; 6 chiffres, 30 s, SHA-1, fenêtre ±1 pas, émetteur « VigiCore ». QR via `qrcode`.
- **Secret** : AES-256-GCM, AAD = id utilisateur (un blob copié sur un autre compte ne se déchiffre pas), préfixe `v1` réservé à la rotation. Jamais renvoyé après l'activation ni journalisé.
- **Codes de récupération** (10, format `XXXXX-YYYYY`) : seul un HMAC-SHA256 (clé dérivée de `MFA_ENCRYPTION_KEY`) est stocké ; comparaison à temps constant sans sortie anticipée ; usage unique.
- **Anti-rejeu** : dernier pas TOTP accepté stocké ; un pas ≤ au dernier est refusé ; mise à jour conditionnelle.
- **Verrouillage** : compteur par compte, N échecs → verrou de X min (429), remis à 0 par un succès ; il ne s'applique qu'à une personne déjà authentifiée (mot de passe ou défi valide) donc n'énumère pas les comptes. `authLimiter` couvre aussi les écritures `/2fa/*`. Verrouillage audité (sans code).
- **Défi de login** : `sessionToken` = JWT 5 min, `purpose:'mfa'`, audience `vigicore:mfa`, signé avec une clé DÉRIVÉE de `JWT_SECRET` (≠ clé des sessions), `jti` à usage unique (table `MfaChallengeUse`). Invalidé par un changement de mot de passe et par la désactivation du compte. `verifySessionToken` rejette en plus tout jeton portant `purpose`/`aud` (défense en profondeur).
- **Erreurs** : mot de passe ET code doivent être justes, réponse identique (`Invalid password or code.`) ; un mot de passe faux n'« brûle » pas un code TOTP juste (compté comme échec).
- **Écart justifié vs. votre conception** : `/2fa/enable` exige aussi le **mot de passe** (pas seulement le code). Sinon, avec un cookie volé, un attaquant activerait SON application et enfermerait le propriétaire hors de son compte. Autres ajouts : `GET /2fa/status` (disponibilité, état, codes restants) pour l'interface ; réponses sensibles en `Cache-Control: no-store`.

## Routes (`/api/auth`)
`POST /2fa/setup` · `POST /2fa/enable {code, password}` · `POST /2fa/disable {password, code|recoveryCode}` · `POST /2fa/recovery-codes/regenerate {password, code TOTP}` · `GET /2fa/status` · `POST /login` (+ `mfaRequired:true, sessionToken` si 2FA actif, **sans cookie**) · `POST /mfa/verify {code, sessionToken}` (remplace le stub ; fonction désactivée = ancien 501) · `GET /session` (+ `user.twoFactorEnabled`).

## Résultats
- **Nouveaux tests** [EXÉC] 23/23 — HTTP réel + faux Prisma en mémoire, **résultat indicatif, non exécuté sur Prisma réel**. Couverts : login sans 2FA inchangé (cookie, `mfaRequired:false`, erreurs d'origine) ; retour arrière flag off (501 d'origine, 404 `/2fa/*`) ; setup/enable nominal, mauvais code/mot de passe, secret chiffré au repos, 10 codes hachés ; clé absente (503, pas de contournement) ; login 2FA sans cookie ; `sessionToken` refusé comme session et jetons forgés `purpose`/`aud` refusés ; code valide, faux, expiré, fenêtre ±1 ; **rejeu refusé** ; défi expiré / déjà utilisé / forgé ; mot de passe changé ou compte désactivé après le défi ; verrouillage (429, levée après 15 min, autre compte non affecté, remise à zéro) ; récupération à usage unique ; disable (mot de passe + code, réponses identiques, tables vidées, audit) ; régénération invalide les anciens codes ; secret/codes/mot de passe absents des réponses, logs et audit ; isolation entre utilisateurs.
- **Mutation check** [EXÉC] — détectés : anti-rejeu retiré · durcissement `purpose/aud` retiré (jetons forgés) · défi signé avec la clé de session sans aud/purpose · verrouillage retiré · secret stocké en clair. **Non détecté : codes de récupération réutilisables** (retrait du filtre `usedAt:null` dans la lecture) : une 2e garde (`updateMany … usedAt:null`) l'empêche encore, comportement équivalent, pas une faille.
- **Suite nexus-api complète** [EXÉC, sans client Prisma généré] : 477 pass / 3 fail / 3 skipped (= 454 de l'Étape 3 + 23). Les 3 échecs sont les connus : `support.routes` (test périmé) et 2 `sse.shutdown` (exigent Prisma généré). Je n'ai pas relancé la baseline de CETTE archive avant modification : le 454 vient du LISEZ-MOI de l'Étape 3 [?].
- `tsc --noEmit` : 61 erreurs avant = 61 après (absence de client Prisma généré), 0 dans les fichiers modifiés. `check-schema-sync.mjs` OK.
- Migrations : SQLite (3.45) chaîne complète appliquée, tables créées [EXÉC] ; PostgreSQL 16 chaîne `postgres/migrations` complète appliquée, 3 tables créées [EXÉC]. Non comparées à `prisma migrate diff` [?].

## Commandes à lancer en local
```bash
cd backend/nexus-api
npm ci && npx prisma generate
node scripts/check-schema-sync.mjs
npx tsc --noEmit
JWT_SECRET=ci-only-test-secret npx vitest run test/mfa.test.ts
JWT_SECRET=ci-only-test-secret npx vitest run
DATABASE_URL=file:./dev.db npx prisma migrate deploy        # SQLite dev (adapter l'URL)
# Postgres : d'abord sync_with_sqlite (README l.16-21), puis :
# DATABASE_URL=postgresql://… npx prisma migrate deploy --schema prisma/postgres/schema.prisma
```
**Ordre de déploiement** : `migrate deploy` → définir `MFA_ENCRYPTION_KEY` → déployer le code → seulement alors `MFA_ENABLED=true`.

## Retour arrière
1) `MFA_ENABLED=false` : login, `/mfa/verify` (501) et `/session` redeviennent exactement ceux d'avant ; les comptes qui avaient activé le 2FA se connectent de nouveau avec le seul mot de passe (**à savoir : c'est une baisse de sécurité assumée du retour arrière**). 2) Non-activation : aucun utilisateur n'est affecté tant qu'il n'a pas fait « enable ». 3) Code : remettre les anciens fichiers, supprimer les ajoutés ; tables inutilisées ou `DROP TABLE "UserMfa","UserMfaRecoveryCode","MfaChallengeUse";` (+ lignes de `_prisma_migrations`).

## Limites / non vérifié
- Aucun test sur Prisma réel ni sur PostgreSQL via Prisma ; rien exécuté avec un vrai client Prisma (`prisma generate`, `upsert/updateMany` réels, transactions) [?]. Aucun test avec une vraie application d'authentification (codes générés par `otplib` dans les tests).
- Situation de course (deux `/mfa/verify` simultanés) : garantie par clé primaire/`updateMany` conditionnels en base réelle, simulée seulement par le faux [?].
- Un code TOTP utilisé à l'activation ne peut pas resservir au login du même pas (attendre le code suivant, ≤ 30 s).
- Les sessions déjà ouvertes ne sont pas fermées à l'activation/désactivation du 2FA.
- Le défi expiré ou consommé n'est pas purgé de façon planifiée (purge opportuniste à chaque vérification réussie).
- Aucune alerte e-mail à l'activation/désactivation (seulement `AuditEntry`).

## Sous-étape 2b (interface) — non faite ; état des lieux [LU]
`frontend/src/lib/auth.js` documente déjà `login → { mfaRequired, sessionToken }` et `verifyMfa(code, sessionToken)` ; `pages/LoginPage.jsx` a une vue `mfa` (cases de chiffres, minuteur, `doMfa`, `onMfaRequired`) à relier, avec un champ pour code de récupération ; `dashboards/pages/LoginPage.jsx` est une 2e page de login (non examinée : à vérifier qu'elle gère `mfaRequired`) ; `dashboards/components/AccountSecurity.jsx` + `dashboards/services/accountApi.js` (changement de mot de passe) sont l'emplacement naturel d'une section « Sécurité du compte » (activer : QR + saisie code + mot de passe ; afficher les codes une seule fois ; désactiver ; régénérer). Les routes et `GET /2fa/status` sont prêtes pour elle.

## Perspectives
2FA obligatoire pour le staff / admin plateforme (`PLATFORM_ADMIN_EMAILS`) · rotation de `MFA_ENCRYPTION_KEY` (préfixe `v1` prévu) · appareils de confiance · WebAuthn / passkeys · fermeture des sessions à l'activation · e-mail de notification à l'activation/désactivation · purge planifiée des défis · alerte staff sur verrouillages répétés.
