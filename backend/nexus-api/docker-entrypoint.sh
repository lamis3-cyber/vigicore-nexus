#!/bin/sh
# Start-up of the API container: bring the PostgreSQL schema up to date, make sure the reserved
# reference data exists, then start the server. Both steps are idempotent (safe on every restart).
# Set RUN_MIGRATIONS=false to skip them (e.g. if migrations are run by a separate job).
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] prisma migrate deploy (prisma/postgres)"
  node_modules/.bin/prisma migrate deploy --schema prisma/postgres/schema.prisma
  echo "[entrypoint] seed: reserved central-queue establishment (idempotent)"
  node_modules/.bin/tsx prisma/seed.ts
fi
# exec: node receives SIGTERM directly (graceful shutdown in src/server.ts)
exec node_modules/.bin/tsx src/server.ts
