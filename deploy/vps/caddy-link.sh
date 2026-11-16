#!/usr/bin/env bash
# Connects the ZivoHotels app's domain to the server's existing Caddy. Safe to run any time:
#  - attaches the Caddy container to our network "zivohotels-app-edge" if it isn't (it isn't
#    after the other project recreates Caddy)
#  - writes our site file next to Caddy's Caddyfile and adds one "import" line if missing
#  - validates the whole config before reloading; if Caddy rejects it, everything is restored
#  - reloads gracefully (no downtime for the other sites); does nothing if already linked
# deploy.sh runs it, and a cron job runs it every 5 minutes, because deploys of the other
# project replace its Caddyfile (and drop our line).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUIET="${1:-}"
say() { [ "$QUIET" = "--quiet" ] || echo "$@"; }

[ -f "$HERE/.env" ] || { echo "❌ $HERE/.env is missing"; exit 1; }
set -a; . "$HERE/.env"; set +a
CADDY="${CADDY_CONTAINER:-staging-caddy}"
: "${APP_DOMAIN:?APP_DOMAIN is not set in $HERE/.env}"

docker inspect "$CADDY" >/dev/null 2>&1 || { echo "❌ Caddy container '$CADDY' not found"; exit 1; }

# Caddy reaches our website over our own network (created by docker compose up)
EDGE_NET="zivohotels-app-edge"
docker network inspect "$EDGE_NET" >/dev/null 2>&1 || { echo "❌ Network $EDGE_NET not found: start the app first (deploy.sh)"; exit 1; }
if ! docker inspect "$CADDY" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -qw "$EDGE_NET"; then
  docker network connect "$EDGE_NET" "$CADDY"
  echo "🔗 Attached $CADDY to $EDGE_NET ($(date))"
fi
DIR="$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}')"
[ -n "$DIR" ] && [ -f "$DIR/Caddyfile" ] || { echo "❌ Can't find the folder mounted at /etc/caddy in '$CADDY'"; exit 1; }

CADDYFILE="$DIR/Caddyfile"
SITE_FILE="$DIR/zivohotels-app.caddy"
IMPORT_LINE="import zivohotels-app.caddy"
NEW_SITE="$(sed "s/__APP_DOMAIN__/$APP_DOMAIN/g" "$HERE/caddy/zivohotels-app.caddy.template")"

BACKUP_DIR="$HERE/.caddy-backups"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
changed=no
had_site=no; [ -f "$SITE_FILE" ] && had_site=yes

if [ "$had_site" = no ] || [ "$(cat "$SITE_FILE")" != "$NEW_SITE" ]; then
  [ "$had_site" = yes ] && cp "$SITE_FILE" "$BACKUP_DIR/zivohotels-app.caddy.$STAMP"
  printf '%s\n' "$NEW_SITE" > "$SITE_FILE"
  chown --reference="$CADDYFILE" "$SITE_FILE" 2>/dev/null || true
  changed=yes
fi
if ! grep -qxF "$IMPORT_LINE" "$CADDYFILE"; then
  cp "$CADDYFILE" "$BACKUP_DIR/Caddyfile.$STAMP"
  printf '\n# ZivoHotels app (separate project in /opt/zivohotels-app), added by its deploy/vps/caddy-link.sh\n%s\n' "$IMPORT_LINE" >> "$CADDYFILE"
  changed=yes
fi

if [ "$changed" = no ]; then
  say "✅ Caddy already routes https://$APP_DOMAIN to the ZivoHotels app"
  exit 0
fi

if docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >"$BACKUP_DIR/last-validate.log" 2>&1; then
  if ! docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >"$BACKUP_DIR/last-reload.log" 2>&1; then
    echo "❌ Caddy reload failed (the previous configuration keeps running). Details:"
    tail -n 5 "$BACKUP_DIR/last-reload.log"
    exit 1
  fi
  echo "✅ Caddy now routes https://$APP_DOMAIN to the ZivoHotels app ($(date))"
else
  echo "❌ Caddy rejected the new configuration; restoring the previous files. Details:"
  tail -n 5 "$BACKUP_DIR/last-validate.log"
  [ -f "$BACKUP_DIR/Caddyfile.$STAMP" ] && cp "$BACKUP_DIR/Caddyfile.$STAMP" "$CADDYFILE"
  if [ -f "$BACKUP_DIR/zivohotels-app.caddy.$STAMP" ]; then cp "$BACKUP_DIR/zivohotels-app.caddy.$STAMP" "$SITE_FILE"
  elif [ "$had_site" = no ]; then rm -f "$SITE_FILE"; fi
  exit 1
fi
