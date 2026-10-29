# Notes des correctifs (historique)

## 2026-10-28 — Lien fiche ↔ produit Audit (étapes 1 à 5) et nettoyage

**Lien explicite fiche → produit VigiCore Audit**
- Étape 1 (base) : colonne `ProductListing.auditProductRef` + index, migrations SQLite et Postgres `20261105090000_listing_audit_product_ref`.
- Étape 2 (serveur) : `GET /api/services/audit-products` ; création / modification vérifient que le produit appartient au fabricant
  de l'établissement (422 / 409 / 503) ; un changement de lien renvoie la fiche en revue ; deux fiches actives ne peuvent pas viser le même produit.
- Étape 3 (masquage) : une fiche liée est masquée ou montrée selon l'offre EXACTE (`hiddenListingIds`) ; une offre introuvable retombe sur
  la règle du fabricant ; `withListingIds` ouvre la fiche liée d'abord, le rapprochement par titre ne sert plus qu'aux fiches non liées.
- Étape 4 (interface) : liste déroulante « Produit lié dans VigiCore Audit » dans ProductStudio, pastilles « Audit : … » / « Non liée à Audit »
  sur la page Produits, produit lié et contrôle dans la revue `/admin/products`. « Dupliquer » ne copie pas le lien.
- Étape 5 (notification) : e-mail au staff (`PLATFORM_ADMIN_EMAILS`) quand une fiche ENTRE dans la file « À valider »
  (nouvelle, corrigée après refus, ou contenu validé modifié). Best-effort ; `LISTING_REVIEW_NOTIFY=false` pour couper.

**Correctif** : la page Messages ne plante plus si l'API répond sans `threads` / `friends` (useSupportUnread, Messenger, SupportPanel).

**Nettoyage (aucun changement de comportement)**
- Supprimés (jamais importés) : les 5 doublons de `backend/nexus-api/src/services/*.routes.ts` et `market.test.ts` (ex-A_SUPPRIMER.txt) ;
  scripts de diagnostic ad hoc `check-market.js`, `check-orders.js`, `diag.js` ; côté frontend `src/config/navConfig.js`,
  `src/dashboards/components/Logo.jsx`, `src/dashboards/lib/declarationsApi.js` (copie identique de `src/lib/declarationsApi.js`),
  `src/dashboards/pages/doctor/DoctorMessagerie.jsx`, `src/pages/Institutional/` (ancienne copie de l'assistant institutionnel),
  `src/pages/manage/ManageServicesPage.jsx` (ancienne copie), `src/pages/services/HeroFloaters.jsx`, `src/pages/services-polish.css`
  (ancienne version de `services/services-polish.css`), `src/pages/services/tests-ui/` (copie d'un test), `src/lib/buyerSources.js` (et son test).
- Détourage : `src/lib/aiCutout.js` (modèle U2-Net-P) n'était plus utilisé — le studio utilise `aiCutoutClassic.js` (IMG.LY). Supprimés avec lui
  `public/ort/` (39 Mo), `public/models/u2netp.onnx`, la partie U2-Net-P du postinstall (qui téléchargeait le modèle depuis GitHub) et
  la dépendance directe `onnxruntime-web` (toujours installée par `@imgly/background-removal`).
- 42 fonctions / constantes exportées jamais utilisées supprimées (frontend : chartConfigs, image.js, cutoutRecover.js, permissions,
  données de démo de l'ancienne messagerie, passage de relais `requestOpenThread` que plus rien ne lisait… ; backend : `isTerminal`,
  `hasHeldNotification`), ainsi que les imports et variables locales inutilisés.
- ai-service : `extract_features` / `rules_based_prediction` (copie morte des règles déjà dans `prediction_service.py`) et `get_db` supprimés.
- Dépendances backend inutilisées retirées : `@zxing/library`, `jsqr`.
- Un seul modèle d'environnement : `backend/nexus-api/.env.example` (fusion de `env.example`, aucune variable perdue).
- `backend/LISEZ-MOI.md` déplacé vers `backend/nexus-api/docs/MFA-2FA.md`.
- Script `npm run order:confirm` ajouté (documenté mais absent de package.json).
- `scripts/repo-hygiene.mjs pack` n'exclut plus les dossiers nommés `models` (il retirait `ai-service/bot/models`, donc du code).
- `src/i18n/translate.test.js` (jamais lancé) déplacé dans `frontend/tests-ui/`.
- Tests UI mis à jour sur l'interface actuelle (ServiceDetail : libellés « Commander via la plateforme » / « Contacter le fabricant »,
  catégorie non autorisée ; InstitutionalFlow : liste des signes en combobox).

## LISEZMOI.txt
```
CORRECTIF-COMPLET (cumulatif) — à copier à la racine du projet en conservant les dossiers, puis redémarrer le serveur ET le front.
Aucun fichier .env n'est inclus ni modifié. Les migrations Prisma déjà fournies restent à appliquer si ce n'est pas fait (npx prisma migrate deploy).

Nouveautés de cette version :
- Bouton de langue de la barre du haut : menu dessiné (FR / عربي / EN) à la place de la liste native qui ne s'affichait pas.
- E-mail CNPM : UN seul message avec les fichiers réellement joints (plus d'e-mail séparé par fichier) ; libellés lisibles (rôle, circonstances, état, impact) ; date de déclaration et de survenue ; pièces annoncées mais non reçues signalées honnêtement.
- Pannes : l'e-mail reprend maintenant le même contexte que les incidents (patient concerné, service, évolution, dates) ; la panne interne avec CNPM coché envoie aussi l'e-mail et les fichiers ; l'étape Impact demande N° dossier, sexe et évolution quand une personne est exposée.
Limites : tests avec faux SMTP et fausse base en mémoire ; envoi réel non vérifié ici ; arabe/anglais non relus par un locuteur natif. L'e-mail du message principal est retenu jusqu'à 60 s (CNPM_ATTACH_HOLD_MS) en attendant les fichiers, en mémoire seulement : un redémarrage du serveur pendant ce délai perd ce message.

Ajout (échec « La déclaration a été refusée ») :
- Le message d'échec indique maintenant la RAISON renvoyée par Audit (code et message), au lieu d'un « refusée » sans explication.
- Après un refus définitif, le formulaire repart d'un nouvel identifiant : un renvoi corrigé n'est plus ramené sur l'ancienne ligne refusée.

═══ IMPLÉMENTATION DES NOUVEAUX PARCOURS (Incident / Panne / Patient) ═══
À FAIRE après copie des fichiers (dans server/) :
  1. npx prisma migrate deploy      (migration ADDITIVE 20261024100000 : table DeclarationDelivery + 3 colonnes sur Attachment ; aucune donnée existante n'est modifiée ni supprimée)
  2. npx prisma generate
  3. (optionnel mais nécessaire pour CONSERVER les pièces jointes) ajouter dans VOTRE .env : ATTACHMENT_ENC_KEY=<64 caractères hexadécimaux, ex. openssl rand -hex 32>
     et vérifier STORAGE_DIR (volume persistant). Sauvegardez le dossier <STORAGE_DIR>/attachments ET la clé : sans la clé, les pièces sont illisibles.
     Sans clé : la conservation est désactivée, l'interface le dit, et les pièces ne partent que par e-mail si le CNPM est choisi.
  4. Redémarrer le serveur ET le front.
Ce qui est réellement en place :
- Incident : Produit → Faits → Gravité → [Personne concernée si « oui »] → Pièces → Récapitulatif modifiable → Destination (toujours la dernière étape). Champs conditionnels selon la catégorie, « inconnu » pour lot / série / UDI, produit hors liste, « appareil défectueux » retiré des natures.
- Panne : Dispositif → Panne → Conséquences → Personne exposée → Pièces → Récapitulatif → Destination ; passage explicite vers un incident (rien n'est créé avant l'envoi).
- Destinations proposées d'après la vérité du serveur : CNPM (e-mail), Mon organisation (espace de l'établissement dans Nexus — PAS une transmission à VigiCore Audit), fabricant (VigiCore Audit, choix séparé, produit du catalogue seulement, sans identité ni fichiers).
- États réels par destination (CNPM : en cours / envoyé — réception non confirmée / échec / non configuré, avec « Renvoyer »). Jamais « transmis à Audit » sans réponse d'Audit.
- Isolation : « CNPM seulement » = invisible de l'organisation ; « Organisation » = visible des seuls membres habilités de l'établissement (contrôles allow() inchangés).
- Pièces jointes : chiffrées AES-256-GCM sur disque, liste/téléchargement contrôlés par les mêmes droits, jointes à l'UNIQUE e-mail CNPM si choisi ; dossier patient : conservation seule, jamais d'e-mail.
- Patient : plus de faux destinataires (CNPM / médecin), plus de badge d'imputabilité, questions d'arrêt/disparition conditionnelles et correctement nommées (productStopped / dechallenge), récapitulatif par blocs « Modifier », message honnête « non transmise ».
Limites : tests avec faux Prisma / faux SMTP / dossier temporaire (pas de vraie base, pas de vrai SMTP, pas de vrai navigateur) ; le client Prisma n'a pas pu être régénéré dans mon environnement (téléchargement bloqué) — d'où l'étape 2 ci-dessus ; la migration a été exécutée sur une base SQLite vierge, pas sur votre base ; arabe/anglais (≈230 nouvelles phrases) non relus par un natif. NON implémenté : « Mon organisation » côté VigiCore Audit (N2), transmission patient → CNPM / médecin, lien patient–médecin, la vérité d'authenticité d'un lot (le catalogue identifie le produit, pas le lot).
```

## site/LISEZMOI.txt
```
LOT COMPLET (remplace les 3 zips précédents : recherche/scan/brouillon + notification CNPM + brouillons dans la liste).
Erreur "Failed to resolve import ../../lib/scanCatalogue" = le fichier src/dashboards/lib/scanCatalogue.js n'avait pas été copié.
1. Dézippez PAR-DESSUS site/ (les chemins src/... et server/... se fusionnent avec les dossiers existants).
2. Vérifiez : ls site/src/dashboards/lib/scanCatalogue.js site/src/dashboards/lib/wizardDrafts.js
3. Dans site/server : npx prisma migrate deploy && npx prisma generate
4. Ajoutez dans site/server/.env (non modifié par ce lot) : CNPM_NOTIFY_EMAIL=lami39564@gmail.com
5. Redémarrez l'API (npm run dev côté server) et le site.
```

## site/server/LISEZMOI.txt
```
Brouillons visibles dans l'onglet « Brouillons » + redirection après enregistrement.
Copiez dans site/ (mêmes chemins) et redémarrez. Aucune migration (la table DeclarationDraft du correctif précédent est requise).
- Enregistrer le brouillon : redirige vers la page Déclarations ; la ligne apparaît dans « Toutes » et « Brouillons » avec « Reprendre ».
- Envoyer : redirection vers la page Déclarations (inchangé).
Pages couvertes : Médecin, Pharmacien, Personnel médical, Hôpital. Pas encore : Laboratoire, Clinique, Centre médical.
```

## Passe pré-hébergement — 2026-10-29
- **PostgreSQL** : migration `20261105990000_sync_with_sqlite` (9 tables + 11 colonnes manquantes, index et clés étrangères, copiées du DDL
  canonique Prisma). Sans elle, `20261106090000_backfill_distributor_listings` échouait et l'API renvoyait 500 sur déclarations, établissements,
  brouillons, assistant, dossiers et marché. Point-virgule retiré d'un commentaire de `20261027090000_listing_engagement` (aucun SQL modifié).
- **CI** : les migrations PostgreSQL sont appliquées sur un vrai PostgreSQL puis comparées au schéma (`migrate diff --exit-code`) ;
  le job audit-api est ignoré proprement si le dossier est absent.
- **API** : `docker-entrypoint.sh` (migrate deploy + seed idempotent au démarrage) ; `.dockerignore` n'embarque plus `prisma/dev.db` et
  garde les `migration.sql` ; `AUDIT_BASE_URL` en http accepté vers un service interne (nom sans point, ex. `http://audit-api:5100`).
- **Dépendances** : body-parser, qs (audit fix) ; deepmerge-ts 8 (override) → `npm audit --omit=dev` : 0. Frontend : react-router-dom 6.30.6,
  overrides lodash 4.18.1 et zod 3.25.76. Résiduel : react-router (open redirect — `safeNext` refuse déjà `\` ; SSR non utilisé) et zod
  (correctif seulement en v4 ; validation côté navigateur de la config du détourage).
- **ai-service** : jeton de service `BOT_SERVICE_TOKEN` (Bearer ou `X-Service-Token`) sur toutes les routes sauf `/health` ; erreurs 500
  génériques et `/docs` désactivé en production ; image non-root + healthcheck.
- **Compose prod** : profil `audit` (audit-db, redis avec mot de passe, audit-api, ai-service), aucun port publié ; `.env.production.example`
  et `scripts/check-env-prod.sh`. Compose dev : ports liés à 127.0.0.1.
- **Frontend** : pages du tableau de bord chargées à la demande (bundle 972 Ko → 158 Ko) ; modèle de détourage « medium » (88 Mo, jamais
  utilisé) plus copié (`KEEP_MEDIUM_MODEL=1` pour le garder) ; og:image absolu quand `SITE_URL` est défini ; CSP de `vite preview` avec les
  hachages du build ; 61 textes anglais traduits (fr/ar) ; 3 tests UI mis à jour sur l'interface du 2026-10-29.
