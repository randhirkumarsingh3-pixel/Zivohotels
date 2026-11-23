#!/usr/bin/env bash
# Restore, or test, a ZivoPlus backup made by backup.sh.
#
#   bash restore.sh --test  [archive]   Check the newest (or given) backup without touching the app:
#                                       checksum, decryption, and a full database restore into a
#                                       throwaway database. Run it monthly (deploy.sh schedules it).
#   bash restore.sh --apply <archive>   Replace the live database and files with the backup.
#                                       Stops the app while restoring. Asks you to type RESTORE first.
#
# An archive copied back from off-site storage works the same way. It needs the same
# BACKUP_PASSPHRASE; the database's encrypted bank details need the same DATA_ENCRYPTION_KEY.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "$HERE/.env"; set +a
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is missing in $HERE/.env}"
DIR="${BACKUP_DIR:-/var/backups/zivoplus-app}"
MODE="${1:-}"; ARCHIVE="${2:-}"
[ -n "$ARCHIVE" ] || ARCHIVE="$(ls -1t "$DIR"/zivoplus-*.tar.enc 2>/dev/null | head -1 || true)"
[ -f "$ARCHIVE" ] || { echo "No backup archive found (looked in $DIR)"; exit 1; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; docker rm -f zivoplus-restore-test >/dev/null 2>&1 || true' EXIT
log() { echo "[$(date '+%F %T')] $*"; }

log "Archive: $ARCHIVE"
if [ -f "$ARCHIVE.sha256" ]; then
  [ "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$(cat "$ARCHIVE.sha256")" ] || { echo "❌ Checksum does not match: the archive is damaged"; exit 1; }
  log "Checksum OK"
fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$ARCHIVE" | tar -xf - -C "$WORK"
log "Decrypted: $(ls "$WORK" | tr '\n' ' ')"

case "$MODE" in
  --test)
    docker run -d --name zivoplus-restore-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=restoretest postgres:16-alpine >/dev/null
    for _ in $(seq 1 30); do docker exec zivoplus-restore-test pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
    docker cp "$WORK/db.dump" zivoplus-restore-test:/tmp/db.dump
    docker exec zivoplus-restore-test pg_restore -U postgres -d restoretest --no-owner /tmp/db.dump >/dev/null 2>&1 || true
    TABLES="$(docker exec zivoplus-restore-test psql -U postgres -d restoretest -tAc "select count(*) from information_schema.tables where table_schema='public'")"
    BOOKINGS="$(docker exec zivoplus-restore-test psql -U postgres -d restoretest -tAc 'select count(*) from "Booking"' 2>/dev/null || echo '?')"
    [ "${TABLES:-0}" -gt 50 ] || { echo "❌ Restore test failed: only ${TABLES:-0} tables came back"; exit 1; }
    log "✅ Restore test passed: $TABLES tables, $BOOKINGS bookings"
    ;;
  --apply)
    read -r -p "This replaces the live database and files with $ARCHIVE. Type RESTORE to continue: " ok
    [ "$ok" = "RESTORE" ] || { echo "Cancelled"; exit 1; }
    COMPOSE=(docker compose -f "$HERE/docker-compose.yml" --env-file "$HERE/.env")
    "${COMPOSE[@]}" stop api web
    docker cp "$WORK/db.dump" zivoplus-app-db-1:/tmp/db.dump
    docker exec zivoplus-app-db-1 pg_restore -U zivoplus -d zivoplus --clean --if-exists --no-owner /tmp/db.dump
    for vol in uploads private-uploads invoices; do
      [ -f "$WORK/$vol.tgz" ] && docker run --rm -v "zivoplus-app_$vol:/data" -v "$WORK:/in:ro" alpine:3.20 sh -c "rm -rf /data/* && tar -xzf /in/$vol.tgz -C /data"
    done
    "${COMPOSE[@]}" up -d --wait
    log "✅ Restored from $ARCHIVE"
    ;;
  *) echo "Usage: restore.sh --test [archive] | --apply <archive>"; exit 1 ;;
esac
