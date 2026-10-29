# Exploitation : sauvegardes, supervision, reprise

## Sauvegardes (vérifiées)
`scripts/backup-prod.sh` : `pg_dump` format custom + archive de `STORAGE_DIR`, empreintes SHA-256, `umask 077`, dossier `700`, rétention `KEEP` (défaut 14).
Planification (exemple cron, hors dépôt, dossier **jamais** sous un répertoire web) :
`15 2 * * * PGURL=… BACKUP_DIR=/var/backups/nexus STORAGE_DIR=/var/lib/docker/volumes/…/storage /opt/nexus/scripts/backup-prod.sh >>/var/log/nexus-backup.log 2>&1`
Une copie **chiffrée hors site** est indispensable (non fournie : dépend du prestataire choisi).
Restauration testée : `LIVE_DB=nexus PGHOST=… PGUSER=… scripts/restore-test.sh <dump>` restaure dans une base temporaire, compare les comptages par table, supprime la base temporaire.
Restauration réelle : `createdb nexus_new && pg_restore --no-owner --no-acl -d nexus_new <dump>`, puis basculer `DATABASE_URL`; fichiers : `tar -xzf storage_*.tar.gz -C <STORAGE_DIR>`.
Le backend Audit a ses propres scripts (`backup.sh` existant, mot de passe à sortir du script).

## Supervision
- `GET /health` (vivant) et `GET /health/ready` (base joignable, 2 s) — utilisés par le `HEALTHCHECK` Docker ; à brancher sur une sonde externe (UptimeRobot, Healthchecks…).
- Journaux : JSON sur stdout (`{t,m,p,s,ms}`) → à collecter (Loki, CloudWatch, journald…). Alerte recommandée : taux de 5xx, latence p95, redémarrages du conteneur.
- Déclarations : surveiller `ExternalSubmission.status IN ('FAILED','NOT_ROUTABLE')` — elles ne restent plus en `PENDING` indéfiniment (FAILED après 12 tentatives, renvoi manuel possible).
- Suivi d'erreurs (Sentry ou équivalent) et alertes d'astreinte : **non intégrés** (nécessitent un compte/DSN du propriétaire).
- Service IA (Audit) : `GET /health` du service à sonder séparément ; la latence du scoring n'est pas mesurée par le code actuel. Le backend consigne un avertissement quand l'IA est indisponible (le rapport est alors enregistré sans score).

## Déclarations des tableaux de bord (`/api/vigilance`)

Les déclarations saisies par médecins, pharmaciens, laboratoires et personnel médical sont stockées dans la table `Declaration` (le détail métier dans `payload`).
- **Portée (serveur, depuis la session)** : chacun voit ce qu'il a rédigé ; `VIGILANCE_REVIEWER`, `HOSPITAL` (vigilance qualité) et `ORG_ADMIN` voient aussi les établissements dont ils sont membres ACTIFS. Les collègues cliniciens ne voient pas les déclarations des autres.
- Établissement, auteur et rôle sont écrits par le serveur ; les valeurs envoyées par le navigateur sont ignorées.
- Une déclaration clôturée ne peut pas être rouverte ; le suivi CAPA et le passage en analyse sont réservés à la vigilance de l'établissement.
- Côté navigateur, `src/dashboards/data/vigilanceStore.js` garde les tableaux partagés comme cache de la base (rechargés à la connexion et à chaque changement de page).

**Limites connues** : le journal d'audit affiché dans les tiroirs (`AUDIT_LOG`) et les fiches patient du médecin (`DR_PATIENTS`) restent en mémoire du navigateur (pas de table dédiée) ; les déclarations des tableaux de bord ne sont pas relayées vers VigiCore Audit (seul le formulaire `/api/declarations` l'est) ; non testé contre une vraie base SQLite/PostgreSQL dans cet environnement (tests de routes avec base simulée).
