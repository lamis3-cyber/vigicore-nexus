#!/usr/bin/env bash
# Proves a backup is restorable: restores the given dump into a TEMPORARY database, compares row counts of every
# table with the live database, then drops the temporary database. Never touches the live data.
# Connection: standard libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD); the role needs CREATEDB.
#   LIVE_DB=nexus ./restore-test.sh /var/backups/nexus/db_XXXX.dump
set -euo pipefail
DUMP="${1:?path to a db_*.dump}"; : "${LIVE_DB:?set LIVE_DB}"
[ -f "$DUMP.sha256" ] && sha256sum -c "$DUMP.sha256"
TMP="restore_test_$(date +%s)"
psql -d postgres -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$TMP\""
trap 'psql -d postgres -qc "DROP DATABASE IF EXISTS \"$TMP\"" >/dev/null' EXIT
pg_restore --no-owner --no-acl --dbname="$TMP" "$DUMP"
for t in $(psql -d "$TMP" -Atc "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"); do
  a=$(psql -d "$TMP" -Atc "select count(*) from \"$t\""); b=$(psql -d "$LIVE_DB" -Atc "select count(*) from \"$t\"" 2>/dev/null || echo "?")
  printf '%-28s restored=%s live=%s\n' "$t" "$a" "$b"
done
echo "RESTORE TEST OK (restored data is readable; differences vs live are expected if data changed since the backup)"
