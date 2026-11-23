#!/usr/bin/env bash
# Deploy or update the ZivoPlus app on the VPS (run as root):
#   bash /opt/zivoplus-app/deploy/vps/deploy.sh
# Optional: BRANCH=some-branch (default main), NO_PULL=1 (deploy the code as it is on disk).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$APP_DIR/deploy/vps"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { echo "❌ $1"; exit 1; }

# ---- checks -------------------------------------------------------------------------------
command -v docker >/dev/null || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "the docker compose plugin is not installed"
[ -f "$HERE/.env" ] || fail "$HERE/.env is missing: copy .env.example to .env and fill it in (README step 4)"
set -a; . "$HERE/.env"; set +a
for v in APP_DOMAIN DB_PASSWORD JWT_SECRET RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET; do
  [ -n "${!v:-}" ] || fail "$v is empty in $HERE/.env"
done
[ "${#JWT_SECRET}" -ge 32 ] || fail "JWT_SECRET must be at least 32 characters (openssl rand -hex 32)"
# Keys created once and kept in .env: the encryption key for bank details and KYC documents, and the
# backup passphrase. Without them encrypted data and backups can't be read: keep a copy OFF this server.
NEW_KEYS=""
if [ -z "${DATA_ENCRYPTION_KEY:-}" ]; then
  DATA_ENCRYPTION_KEY="$(openssl rand -base64 32)"; printf '\nDATA_ENCRYPTION_KEY=%s\n' "$DATA_ENCRYPTION_KEY" >> "$HERE/.env"; NEW_KEYS="$NEW_KEYS DATA_ENCRYPTION_KEY"
fi
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  BACKUP_PASSPHRASE="$(openssl rand -base64 33 | tr -d '\n=/+')"; printf 'BACKUP_PASSPHRASE=%s\n' "$BACKUP_PASSPHRASE" >> "$HERE/.env"; NEW_KEYS="$NEW_KEYS BACKUP_PASSPHRASE"
fi
chmod 600 "$HERE/.env"
export DATA_ENCRYPTION_KEY BACKUP_PASSPHRASE
CADDY="${CADDY_CONTAINER:-staging-caddy}"
docker inspect "$CADDY" >/dev/null 2>&1 || fail "Caddy container '$CADDY' not found (set CADDY_CONTAINER in .env)"
for other in APP_HOST API_HOST S3_HOST; do
  taken="$(docker exec "$CADDY" printenv "$other" 2>/dev/null || true)"
  [ -z "$taken" ] || [ "$taken" != "$APP_DOMAIN" ] || fail "APP_DOMAIN $APP_DOMAIN is already used by the other project ($other)"
done
# The app used to run under the internal name "zivohotels-app". Starting under the new name while
# the old one still holds the data would start an empty database: move it first (once).
if docker volume inspect zivohotels-app_db-data >/dev/null 2>&1 && ! docker volume inspect zivoplus-app_db-data >/dev/null 2>&1; then
  fail "The app's data is still under the old name (zivohotels-app). Run the one-time move first: bash $HERE/move-to-zivoplus.sh"
fi
# The site's address (and any old addresses that forward to it) must point to this server in DNS,
# or Caddy can't get its HTTPS certificate and the site goes down
getent hosts "$APP_DOMAIN" >/dev/null || fail "$APP_DOMAIN doesn't resolve yet: add its DNS record (pointing to this server) first, or keep the old APP_DOMAIN in $HERE/.env"
for d in $(echo "${REDIRECT_DOMAINS:-}" | tr "," " "); do
  getent hosts "$d" >/dev/null || fail "$d (in REDIRECT_DOMAINS) doesn't resolve: add its DNS record first, or remove it from REDIRECT_DOMAINS"
done
COMPOSE=(docker compose -f "$HERE/docker-compose.yml" --env-file "$HERE/.env")
# Advanced: an extra compose file layered on top (e.g. local overrides), if you ever need one
[ -n "${COMPOSE_OVERRIDE:-}" ] && COMPOSE+=(-f "$COMPOSE_OVERRIDE")

# ---- code ---------------------------------------------------------------------------------
if [ "${NO_PULL:-}" != "1" ]; then
  step "Updating code ($BRANCH)"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi
git log --oneline -1

# ---- build and start ----------------------------------------------------------------------
step "Building images"
"${COMPOSE[@]}" build

step "Database"
"${COMPOSE[@]}" up -d --wait db

step "Migrations and search indexes"
"${COMPOSE[@]}" run --rm --no-deps api npx prisma migrate deploy
"${COMPOSE[@]}" run --rm --no-deps api node scripts/setup_trgm.js

step "Starting the app"
"${COMPOSE[@]}" up -d --wait --remove-orphans

# ---- Caddy --------------------------------------------------------------------------------
step "Connecting https://$APP_DOMAIN in Caddy"
bash "$HERE/caddy-link.sh"
CRON=/etc/cron.d/zivoplus-app-caddy
if [ -w /etc/cron.d ] && [ ! -f "$CRON" ]; then
  echo "*/5 * * * * root bash $HERE/caddy-link.sh --quiet >> /var/log/zivoplus-app-caddy.log 2>&1" > "$CRON"
  echo "Installed $CRON (re-links Caddy after the other project's deploys)"
fi

# ---- backups ------------------------------------------------------------------------------
if [ -w /etc/cron.d ]; then
  cat > /etc/cron.d/zivoplus-app-backup <<CRON
# Nightly encrypted backup (03:15) and a monthly restore test (1st, 04:30). See $HERE/backup.sh
15 3 * * * root bash $HERE/backup.sh >> /var/log/zivoplus-app-backup.log 2>&1
30 4 1 * * root bash $HERE/restore.sh --test >> /var/log/zivoplus-app-backup.log 2>&1
CRON
  echo "Backups scheduled: /etc/cron.d/zivoplus-app-backup (log: /var/log/zivoplus-app-backup.log)"
fi
[ -n "${BACKUP_S3_BUCKET:-}" ] || echo "⚠️  Off-site backup copies are not set up yet: add BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY (and BACKUP_S3_ENDPOINT for R2/B2/Wasabi) to $HERE/.env"
if [ -n "$NEW_KEYS" ]; then
  echo
  echo "🔑 Created:$NEW_KEYS in $HERE/.env"
  echo "   Copy these values into your password manager NOW. Without them, bank details, KYC documents"
  echo "   and backups cannot be read if this server is lost:   grep -E 'DATA_ENCRYPTION_KEY|BACKUP_PASSPHRASE' $HERE/.env"
fi

# ---- check --------------------------------------------------------------------------------
step "Health check"
for i in $(seq 1 30); do
  if curl -fsS --max-time 10 "https://$APP_DOMAIN/ready" >/dev/null 2>&1; then
    echo "✅ Live: https://$APP_DOMAIN"
    exit 0
  fi
  sleep 4   # the first visit waits for the HTTPS certificate
done
echo "⚠️  https://$APP_DOMAIN did not answer yet. Inside the server the app is:"
"${COMPOSE[@]}" ps
"${COMPOSE[@]}" exec -T zivoplus-app-web wget -qO- http://127.0.0.1/ready || true
echo
echo "Check Caddy's log: docker logs --tail 50 $CADDY"
exit 1
