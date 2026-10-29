# Web image: builds the SPA, serves it with Caddy (+ reverse proxy to the API). Build context = ./frontend
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
ARG SITE_URL=""
ARG VITE_LEGAL_PUBLISHER_NAME=""
ARG VITE_LEGAL_ADDRESS=""
ARG VITE_LEGAL_REGISTRATION=""
ARG VITE_LEGAL_CONTACT_EMAIL=""
ARG VITE_LEGAL_DPO_CONTACT=""
ARG VITE_LEGAL_HOST=""
ARG VITE_LEGAL_LAST_UPDATED=""
ENV SITE_URL=$SITE_URL VITE_LEGAL_PUBLISHER_NAME=$VITE_LEGAL_PUBLISHER_NAME VITE_LEGAL_ADDRESS=$VITE_LEGAL_ADDRESS \
    VITE_LEGAL_REGISTRATION=$VITE_LEGAL_REGISTRATION VITE_LEGAL_CONTACT_EMAIL=$VITE_LEGAL_CONTACT_EMAIL \
    VITE_LEGAL_DPO_CONTACT=$VITE_LEGAL_DPO_CONTACT VITE_LEGAL_HOST=$VITE_LEGAL_HOST VITE_LEGAL_LAST_UPDATED=$VITE_LEGAL_LAST_UPDATED
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
# Allow exactly the inline scripts that the build contains (hashes computed at build time).
RUN sh -c 'echo "export CSP_SCRIPT_HASHES=\"$(cat /srv/csp-script-hashes.txt)\"" > /etc/caddy/csp.env'
ENTRYPOINT ["sh", "-c", ". /etc/caddy/csp.env && exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
