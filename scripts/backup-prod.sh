#!/usr/bin/env bash
# Daily backup: PostgreSQL (custom format) + persistent file storage (chat files). Run from cron/systemd timer
# on the host (NOT inside the web root, NOT in the deployment artifact).
#   PGURL=postgresql://user:pass@host:5432/db  BACKUP_DIR=/var/backups/nexus  STORAGE_DIR=/path/to/storage  ./backup.sh
# Retention: KEEP (default 14) newest backups of each kind. Credentials are read from the environment only.
set -euo pipefail
umask 077
: "${PGURL:?set PGURL}"; : "${BACKUP_DIR:?set BACKUP_DIR (private directory, never under a web root)}"
KEEP="${KEEP:-14}"; TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
DB_FILE="$BACKUP_DIR/db_$TS.dump"
pg_dump --format=custom --no-owner --no-acl --dbname="$PGURL" --file="$DB_FILE"
pg_restore --list "$DB_FILE" >/dev/null                      # the archive must be readable
sha256sum "$DB_FILE" > "$DB_FILE.sha256"
if [ -n "${STORAGE_DIR:-}" ] && [ -d "$STORAGE_DIR" ]; then
  tar -C "$STORAGE_DIR" -czf "$BACKUP_DIR/storage_$TS.tar.gz" . && sha256sum "$BACKUP_DIR/storage_$TS.tar.gz" > "$BACKUP_DIR/storage_$TS.tar.gz.sha256"
fi
for pat in 'db_*.dump' 'storage_*.tar.gz'; do
  ls -1t "$BACKUP_DIR"/$pat 2>/dev/null | tail -n +"$((KEEP+1))" | while read -r f; do rm -f -- "$f" "$f.sha256"; done
done
echo "backup ok: $(basename "$DB_FILE")"
# Off-site copy (encrypted, other provider/region) is the operator's responsibility: a backup on the same disk is not a backup.
