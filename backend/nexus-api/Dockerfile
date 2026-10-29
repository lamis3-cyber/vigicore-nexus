# API image. Build context = ./backend/nexus-api
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
# Prisma client for the PRODUCTION (PostgreSQL) schema, see docs/DEPLOYMENT.md
RUN npx prisma generate --schema prisma/postgres/schema.prisma

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/storage && chown -R node:node /data /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node src ./src
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
USER node
ENV STORAGE_DIR=/data/storage PORT=4000
VOLUME ["/data/storage"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applies pending migrations + idempotent seed, then execs the server (SIGTERM reaches node directly).
CMD ["sh", "./docker-entrypoint.sh"]
