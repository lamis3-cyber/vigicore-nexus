#!/bin/bash
# Sauvegarde de la base PostgreSQL de développement (VigiCore Audit) vers database/backups/
# Usage : ./scripts/backup-db.sh   (variables : PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
set -euo pipefail
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/database/backups"
mkdir -p "$OUT_DIR"
DATE=$(date +%Y%m%d_%H%M)
PGPASSWORD="${PGPASSWORD:-materio_password}" pg_dump \
  -h "${PGHOST:-localhost}" -p "${PGPORT:-5433}" -U "${PGUSER:-materio_user}" \
  -d "${PGDATABASE:-materiovigilance}" \
  --no-owner --no-acl \
  > "$OUT_DIR/database_backup_$DATE.sql"
echo "Backup créé : database/backups/database_backup_$DATE.sql"
# Garde seulement les 5 dernières sauvegardes
ls -t "$OUT_DIR"/database_backup_*.sql | tail -n +6 | xargs rm -f 2>/dev/null || true
