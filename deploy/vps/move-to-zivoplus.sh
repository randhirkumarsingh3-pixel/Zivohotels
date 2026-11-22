#!/usr/bin/env bash
# One-time move of the app's internal names from ZivoHotels to ZivoPlus (run as root, once):
#   bash /opt/zivohotels-app/deploy/vps/move-to-zivoplus.sh
#
#   Docker project   zivohotels-app        -> zivoplus-app
#   data volumes     zivohotels-app_*      -> zivoplus-app_*   (copied; the old ones are kept)
#   database / user  zivohotels            -> zivoplus
#   folder           /opt/zivohotels-app   -> /opt/zivoplus-app (old path kept as a link)
#   Caddy, cron      zivohotels-app.caddy, /etc/cron.d/zivohotels-app-* -> zivoplus-app*
#
# What it does, in order: checks (disk space too), a database backup, builds the new images while
# the site still runs, then stops the site (a few minutes), copies the data, renames the database,
# moves the folder and starts everything under the new names with deploy.sh.
# If any step fails, it puts everything back as it was and starts the old site again.
# The other project on this server is not touched (only our own Caddy file and import line).
set -Eeuo pipefail

OLD=zivohotels-app
NEW=zivoplus-app
OLD_DIR="${OLD_DIR:-/opt/zivohotels-app}"
NEW_DIR="${NEW_DIR:-/opt/zivoplus-app}"
BACKUPS="${BACKUPS:-/var/backups/zivoplus-app}"
VOLUMES=(db-data redis-data uploads private-uploads invoices)
STAMP="$(date +%Y%m%d-%H%M%S)"

# The folder is moved while this runs, so run from a copy
if [ -z "${ZP_MOVE_SRC:-}" ]; then
  SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
  cp "${BASH_SOURCE[0]}" /tmp/move-to-zivoplus.sh
  ZP_MOVE_SRC="$SRC" exec bash /tmp/move-to-zivoplus.sh "$@"
fi
SRC="$ZP_MOVE_SRC"
VPS="deploy/vps"
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { echo "❌ $1"; exit 1; }

# ---- checks -------------------------------------------------------------------------------
step "Checks"
[ "$(id -u)" = 0 ] || fail "run as root"
command -v docker >/dev/null || fail "docker is not installed"
if docker volume inspect "${NEW}_db-data" >/dev/null 2>&1 && [ -n "$(docker ps -q --filter "label=com.docker.compose.project=$NEW" --filter label=com.docker.compose.service=db)" ]; then
  echo "✅ Already moved: the app runs as $NEW. Deploy with: bash $NEW_DIR/$VPS/deploy.sh"; exit 0
fi
docker volume inspect "${OLD}_db-data" >/dev/null 2>&1 || fail "no data under the old name (${OLD}_db-data): nothing to move"
grep -q "^name: $NEW" "$SRC/$VPS/docker-compose.yml" || fail "$SRC has older code: update it first (cd $SRC && git pull origin main)"
[ -f "$SRC/$VPS/.env" ] || fail "$SRC/$VPS/.env is missing"
if [ "$SRC" != "$NEW_DIR" ] && [ -e "$NEW_DIR" ] && [ ! -L "$NEW_DIR" ]; then fail "$NEW_DIR already exists: move it away first"; fi
set -a; . "$SRC/$VPS/.env"; set +a
: "${DB_PASSWORD:?DB_PASSWORD is empty in .env}"
CADDY="${CADDY_CONTAINER:-staging-caddy}"
docker inspect "$CADDY" >/dev/null 2>&1 || fail "Caddy container '$CADDY' not found"
CADDY_DIR="$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}')"
[ -n "$CADDY_DIR" ] && [ -f "$CADDY_DIR/Caddyfile" ] || fail "can't find Caddy's Caddyfile"
OLD_DB="$(docker ps -q --filter "label=com.docker.compose.project=$OLD" --filter label=com.docker.compose.service=db)"
[ -n "$OLD_DB" ] || fail "the old database container isn't running: start the site first, then run this again"

# The old setup's compose file (for putting things back if a step fails): the version just before
# the rename
RENAME_COMMIT="$(git -C "$SRC" log -1 --format=%H -S"name: $NEW" -- "$VPS/docker-compose.yml")"
[ -n "$RENAME_COMMIT" ] || fail "can't find the rename in the git history"
OLD_COMPOSE_REL="$VPS/docker-compose.$OLD-old.yml"
git -C "$SRC" show "$RENAME_COMMIT^:$VPS/docker-compose.yml" > "$SRC/$OLD_COMPOSE_REL"
grep -q "^name: $OLD" "$SRC/$OLD_COMPOSE_REL" || fail "the old compose file doesn't look right"

# Disk space: the data is copied once (the old copy stays until you delete it)
NEED=0
for v in "${VOLUMES[@]}"; do
  if docker volume inspect "${OLD}_$v" >/dev/null 2>&1; then
    n="$(du -sk "$(docker volume inspect -f '{{.Mountpoint}}' "${OLD}_$v")" | cut -f1)"; NEED=$((NEED + n))
  fi
done
FREE="$(df -Pk "$(docker info -f '{{.DockerRootDir}}')" | awk 'NR==2 {print $4}')"
echo "Data to copy: $((NEED / 1024)) MB; free: $((FREE / 1024)) MB"
[ "$FREE" -gt $((NEED * 2 + 2097152)) ] || fail "not enough free disk space (need about $((NEED * 2 / 1024 + 2048)) MB)"

if [ "${YES:-}" != "1" ]; then
  echo
  echo "This moves the app to the ZivoPlus names. The site is down for a few minutes while the data"
  echo "is copied. A database backup is made first, the old data is kept, and if anything fails"
  echo "everything is put back automatically."
  read -r -p "Type MOVE to continue: " answer
  [ "$answer" = "MOVE" ] || fail "cancelled"
fi

# ---- backup -------------------------------------------------------------------------------
step "Database backup"
mkdir -p "$BACKUPS"
DUMP="$BACKUPS/before-zivoplus-$STAMP.dump"
docker exec "$OLD_DB" pg_dump -U zivohotels -Fc zivohotels > "$DUMP"
[ -s "$DUMP" ] || fail "the backup is empty"
echo "Saved $DUMP ($(du -h "$DUMP" | cut -f1))"

# ---- build while the site still runs ----------------------------------------------------------
step "Building the new images (the site is still up)"
NEW_COMPOSE=(docker compose -f "$SRC/$VPS/docker-compose.yml" --env-file "$SRC/$VPS/.env")
# Advanced (testing): extra compose files layered on the new and the old setup
[ -n "${COMPOSE_OVERRIDE:-}" ] && NEW_COMPOSE+=(-f "$COMPOSE_OVERRIDE")
OLD_EXTRA=(); [ -n "${OLD_COMPOSE_OVERRIDE:-}" ] && OLD_EXTRA=(-f "$OLD_COMPOSE_OVERRIDE")
"${NEW_COMPOSE[@]}" build

# ---- from here on, any failure puts everything back -------------------------------------------
STAGE=stopped
MOVED=no
CADDY_BACKUP="$BACKUPS/caddy-before-zivoplus-$STAMP"
CRON_BACKUP="$BACKUPS/cron-before-zivoplus-$STAMP"
rollback() {
  local code=$?
  trap - ERR INT TERM
  [ "$STAGE" = done ] && return
  echo
  echo "⚠️  A step failed (exit $code). Putting everything back as it was…"
  set +e
  docker compose -p "$NEW" down --remove-orphans >/dev/null 2>&1
  docker rm -f zivoplus-move-db >/dev/null 2>&1
  if [ "$MOVED" = yes ]; then [ -L "$SRC" ] && rm -f "$SRC"; mv "$NEW_DIR" "$SRC"; fi
  if [ -d "$CADDY_BACKUP" ]; then
    cp "$CADDY_BACKUP/Caddyfile" "$CADDY_DIR/Caddyfile"
    [ -f "$CADDY_BACKUP/$OLD.caddy" ] && cp "$CADDY_BACKUP/$OLD.caddy" "$CADDY_DIR/$OLD.caddy"
    rm -f "$CADDY_DIR/$NEW.caddy"
  fi
  # The nightly backup job goes back; the Caddy re-link job doesn't (it would run the new code)
  rm -f "/etc/cron.d/$NEW-caddy" "/etc/cron.d/$NEW-backup"
  [ -f "$CRON_BACKUP/$OLD-backup" ] && cp "$CRON_BACKUP/$OLD-backup" /etc/cron.d/
  docker compose -p "$OLD" -f "$SRC/$OLD_COMPOSE_REL" "${OLD_EXTRA[@]}" --env-file "$SRC/$VPS/.env" up -d --no-build --wait
  docker network connect "$OLD-edge" "$CADDY" 2>/dev/null
  docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo
  echo "↩️  Put back: the site runs as before under the old names (the new copies, if any, were"
  echo "    left in place and are replaced on the next try). Backup: $DUMP"
  echo "    The Caddy re-link job is off until the next successful deploy; please send the output"
  echo "    above so the cause can be fixed."
  exit 1
}
trap rollback ERR INT TERM

step "Stopping the site"
docker network disconnect "$OLD-edge" "$CADDY" 2>/dev/null || true
docker compose -p "$OLD" -f "$SRC/$OLD_COMPOSE_REL" "${OLD_EXTRA[@]}" --env-file "$SRC/$VPS/.env" down --remove-orphans

step "Copying the data to the new names (the old copies are kept)"
COPY_IMAGE=postgres:16-alpine
for v in "${VOLUMES[@]}"; do
  docker volume inspect "${OLD}_$v" >/dev/null 2>&1 || continue
  docker volume rm "${NEW}_$v" >/dev/null 2>&1 || true   # a leftover from an earlier try
  docker volume create --label "com.docker.compose.project=$NEW" --label "com.docker.compose.volume=$v" "${NEW}_$v" >/dev/null
  docker run --rm --entrypoint sh -v "${OLD}_$v:/from:ro" -v "${NEW}_$v:/to" "$COPY_IMAGE" -c 'cp -a /from/. /to/'
  echo "  ${OLD}_$v -> ${NEW}_$v"
done

step "Renaming the database and its user to zivoplus"
docker run -d --name zivoplus-move-db -v "${NEW}_db-data:/var/lib/postgresql/data" "$COPY_IMAGE" >/dev/null
for i in $(seq 1 60); do docker exec zivoplus-move-db pg_isready -q -U zivohotels -d postgres 2>/dev/null && break; sleep 1; done
docker exec zivoplus-move-db pg_isready -q -U zivohotels -d postgres
docker exec zivoplus-move-db psql -v ON_ERROR_STOP=1 -q -U zivohotels -d postgres -c "CREATE ROLE zivo_move LOGIN SUPERUSER"
docker exec -i zivoplus-move-db psql -v ON_ERROR_STOP=1 -q -U zivo_move -d postgres -v pw="$DB_PASSWORD" <<'SQL'
ALTER ROLE zivohotels RENAME TO zivoplus;
ALTER ROLE zivoplus PASSWORD :'pw';
ALTER DATABASE zivohotels RENAME TO zivoplus;
SQL
docker exec zivoplus-move-db psql -v ON_ERROR_STOP=1 -q -U zivoplus -d postgres -c "DROP ROLE zivo_move"
docker exec zivoplus-move-db psql -v ON_ERROR_STOP=1 -tAq -U zivoplus -d zivoplus -c 'select count(*) from "User"' >/dev/null
docker stop zivoplus-move-db >/dev/null && docker rm zivoplus-move-db >/dev/null
echo "  database zivoplus, user zivoplus"

step "Caddy and scheduled jobs"
mkdir -p "$CADDY_BACKUP" "$CRON_BACKUP"
cp "$CADDY_DIR/Caddyfile" "$CADDY_BACKUP/Caddyfile"
[ -f "$CADDY_DIR/$OLD.caddy" ] && cp "$CADDY_DIR/$OLD.caddy" "$CADDY_BACKUP/$OLD.caddy"
for f in /etc/cron.d/$OLD-caddy /etc/cron.d/$OLD-backup; do [ -f "$f" ] && cp "$f" "$CRON_BACKUP/"; done
rm -f "/etc/cron.d/$OLD-caddy"   # deploy.sh installs the new one
if [ -f "/etc/cron.d/$OLD-backup" ]; then
  echo "15 3 * * * root docker exec $NEW-db-1 pg_dump -U zivoplus -Fc zivoplus > $BACKUPS/db-\$(date +\\%F).dump && find $BACKUPS -name 'db-*.dump' -mtime +14 -delete" > "/etc/cron.d/$NEW-backup"
  rm -f "/etc/cron.d/$OLD-backup"
  echo "  nightly backups now go to $BACKUPS"
fi
docker network rm "$OLD-edge" >/dev/null 2>&1 || true

step "Moving the folder to $NEW_DIR"
if [ "$SRC" != "$NEW_DIR" ]; then
  mv "$SRC" "$NEW_DIR"; MOVED=yes
  ln -s "$NEW_DIR" "$SRC"
fi
SRC_AFTER="$NEW_DIR"

step "Starting under the new names"
NO_PULL=1 bash "$SRC_AFTER/$VPS/deploy.sh"

STAGE=done
trap - ERR INT TERM
rm -f "$SRC_AFTER/$OLD_COMPOSE_REL"
cat <<EOF

✅ Moved. The app now runs as "$NEW" from $NEW_DIR.
   From now on deploy with:   bash $NEW_DIR/$VPS/deploy.sh
   ($OLD_DIR still works as a link to the new folder.)

   Kept for safety, delete when you're happy (a week or so):
     the old data:   docker volume rm $(printf "${OLD}_%s " "${VOLUMES[@]}")
     the old images: docker image rm \$(docker image ls -q --filter "reference=$OLD-*")
     the backup:     $DUMP
EOF
