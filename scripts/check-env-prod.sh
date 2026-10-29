#!/usr/bin/env bash
# Checks .env.production before `docker compose up` (values are never printed).
#   bash scripts/check-env-prod.sh               → Site only
#   bash scripts/check-env-prod.sh --audit       → Site + Audit + AI (profile "audit")
set -u
FILE="${ENV_FILE:-.env.production}"
[ -f "$FILE" ] || { echo "✗ $FILE introuvable (copiez .env.production.example)"; exit 1; }
get() { grep -E "^$1=" "$FILE" | tail -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/; s/[[:space:]]+$//'; }
fail=0
need() { v="$(get "$1")"; if [ -z "$v" ]; then echo "✗ $1 manquant"; fail=1; fi; }
minlen() { v="$(get "$1")"; if [ -n "$v" ] && [ ${#v} -lt "$2" ]; then echo "✗ $1 trop court (< $2 caractères)"; fail=1; fi; }
https() { v="$(get "$1")"; case "$v" in https://*) ;; "") ;; *) echo "✗ $1 doit commencer par https://"; fail=1;; esac; }
warn() { v="$(get "$1")"; [ -z "$v" ] && echo "• $1 vide : $2"; }

for k in SITE_ADDRESS SITE_URL CORS_ORIGIN APP_BASE_URL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD JWT_SECRET PLATFORM_ADMIN_EMAILS; do need $k; done
minlen JWT_SECRET 32; https SITE_URL; https CORS_ORIGIN; https APP_BASE_URL
case "$(get SITE_ADDRESS)" in http*) echo "✗ SITE_ADDRESS = domaine seul, sans http(s)://"; fail=1;; esac
case "$(get PLATFORM_ADMIN_EMAILS)" in *@demo.*) echo "✗ PLATFORM_ADMIN_EMAILS contient une adresse de démonstration"; fail=1;; esac
warn ATTACHMENT_ENC_KEY "les pièces jointes des déclarations ne seront pas conservées"
warn SMTP_HOST "reset mot de passe et formulaire de contact répondront 503"
warn VITE_LEGAL_PUBLISHER_NAME "la page /legal affichera « à renseigner »"
warn TURN_URLS "les appels audio/vidéo ne marcheront qu'en réseau local"

if [ "${1:-}" = "--audit" ]; then
  [ -d backend/audit-api ] || { echo "✗ dossier backend/audit-api absent (à ajouter avant --profile audit)"; fail=1; }
  [ -f .env.audit.production ] || echo "• .env.audit.production absent (variables propres à Audit : modèle backend/audit-api/.env.example)"
  for k in AUDIT_POSTGRES_PASSWORD REDIS_PASSWORD NEXUS_SERVICE_JWT_SECRET BOT_SERVICE_TOKEN AUDIT_BASE_URL; do need $k; done
  minlen NEXUS_SERVICE_JWT_SECRET 32; minlen BOT_SERVICE_TOKEN 32
  [ "$(get AUDIT_BASE_URL)" = "http://audit-api:5100" ] || echo "• AUDIT_BASE_URL attendu : http://audit-api:5100 avec --profile audit"
else
  a="$(get AUDIT_BASE_URL)"; n="$(get NEXUS_SERVICE_JWT_SECRET)"
  if [ -n "$a" ] && [ -z "$n" ] || [ -z "$a" ] && [ -n "$n" ]; then echo "✗ AUDIT_BASE_URL et NEXUS_SERVICE_JWT_SECRET vont ensemble"; fail=1; fi
fi
[ $fail = 0 ] && echo "✓ $FILE prêt" || { echo "→ corrigez les points ✗ ci-dessus"; exit 1; }
