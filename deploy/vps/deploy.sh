#!/usr/bin/env bash
# Deploy or update the ZivoHotels app on the VPS (run as root):
#   bash /opt/zivohotels-app/deploy/vps/deploy.sh
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
CADDY="${CADDY_CONTAINER:-staging-caddy}"
docker inspect "$CADDY" >/dev/null 2>&1 || fail "Caddy container '$CADDY' not found (set CADDY_CONTAINER in .env)"
for other in APP_HOST API_HOST S3_HOST; do
  taken="$(docker exec "$CADDY" printenv "$other" 2>/dev/null || true)"
  [ -z "$taken" ] || [ "$taken" != "$APP_DOMAIN" ] || fail "APP_DOMAIN $APP_DOMAIN is already used by the other project ($other)"
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
CRON=/etc/cron.d/zivohotels-app-caddy
if [ -w /etc/cron.d ] && [ ! -f "$CRON" ]; then
  echo "*/5 * * * * root bash $HERE/caddy-link.sh --quiet >> /var/log/zivohotels-app-caddy.log 2>&1" > "$CRON"
  echo "Installed $CRON (re-links Caddy after the other project's deploys)"
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
"${COMPOSE[@]}" exec -T zivohotels-app-web wget -qO- http://127.0.0.1/ready || true
echo
echo "Check Caddy's log: docker logs --tail 50 $CADDY"
exit 1
