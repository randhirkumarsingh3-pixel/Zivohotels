#!/usr/bin/env bash
# Deploy (or update) ZivoHotels STAGING on this server.
# Run as the app user from anywhere:  bash /var/www/zivohotels-staging/app/deploy/staging/deploy.sh
# Optional: BRANCH=some-branch bash deploy.sh   (default: main)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

for cmd in git node npm pm2 curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "❌ '$cmd' is not installed or not on PATH (see deploy/staging/README.md, step 3)"; exit 1; }
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || { echo "❌ Node.js 20 or newer is required (found $(node -v))"; exit 1; }

[ -f backend/.env ] || { echo "❌ backend/.env is missing (see deploy/staging/README.md, step 7)"; exit 1; }
[ -f .env.production.local ] || { echo "❌ .env.production.local is missing (see deploy/staging/README.md, step 8)"; exit 1; }
API_PORT="$(grep -E '^PORT=' backend/.env | cut -d= -f2 | tr -d '"' || true)"
API_PORT="${API_PORT:-5000}"

step "Updating code ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
git log --oneline -1

step "Backend: dependencies, database client and migrations"
cd backend
npm ci --omit=dev --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
node scripts/setup_trgm.js
cd ..

step "Frontend: build"
npm ci --no-audit --no-fund
npm run build

step "Restarting the API"
pm2 startOrReload deploy/staging/ecosystem.config.cjs --update-env
pm2 save

step "Health check"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/ready" >/dev/null 2>&1; then
    echo "✅ Staging is up: API ready on port ${API_PORT}"
    exit 0
  fi
  sleep 2
done
echo "❌ The API did not become ready. Last log lines:"
pm2 logs zivohotels-staging-api --lines 40 --nostream
exit 1
