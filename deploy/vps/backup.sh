#!/usr/bin/env bash
# Nightly backup of the ZivoPlus app (installed by deploy.sh as /etc/cron.d/zivoplus-app-backup).
#   bash /opt/zivoplus-app/deploy/vps/backup.sh
#
# What: the database (pg_dump), hotel photos, KYC documents, guest invoices and app logs.
# How:  one archive per night, encrypted (AES-256, key from BACKUP_PASSPHRASE in .env), with a
#       SHA-256 checksum. Kept 14 days in /var/backups/zivoplus-app.
# Off-site: when BACKUP_S3_BUCKET (and its keys) are set in .env, each archive is also copied to
#       that S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2, Wasabi…). Keep 30+ days there.
# Restore or test a restore: restore.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "$HERE/.env"; set +a
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is missing in $HERE/.env (deploy.sh creates it)}"
DIR="${BACKUP_DIR:-/var/backups/zivoplus-app}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%F-%H%M)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$DIR"; chmod 700 "$DIR"
log() { echo "[$(date '+%F %T')] $*"; }

log "Database"
docker exec zivoplus-app-db-1 pg_dump -U zivoplus -Fc zivoplus > "$WORK/db.dump"

log "Files (photos, KYC documents, invoices, logs)"
for vol in uploads private-uploads invoices logs; do
  if docker volume inspect "zivoplus-app_$vol" >/dev/null 2>&1; then
    docker run --rm -v "zivoplus-app_$vol:/data:ro" -v "$WORK:/out" alpine:3.20 tar -czf "/out/$vol.tgz" -C /data .
  fi
done

log "Encrypting"
ARCHIVE="$DIR/zivoplus-$STAMP.tar.enc"
tar -cf - -C "$WORK" . | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -out "$ARCHIVE"
sha256sum "$ARCHIVE" | awk '{print $1}' > "$ARCHIVE.sha256"
chmod 600 "$ARCHIVE" "$ARCHIVE.sha256"
log "Saved $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  log "Copying off-site to s3://$BACKUP_S3_BUCKET"
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY:?BACKUP_S3_ACCESS_KEY missing}" \
    -e AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY:?BACKUP_S3_SECRET_KEY missing}" \
    -e AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}" \
    -v "$DIR:/backups:ro" amazon/aws-cli:2.17.0 \
    ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} \
    s3 cp "/backups/$(basename "$ARCHIVE")" "s3://$BACKUP_S3_BUCKET/zivoplus/" --only-show-errors
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
    -e AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}" \
    -v "$DIR:/backups:ro" amazon/aws-cli:2.17.0 \
    ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} \
    s3 cp "/backups/$(basename "$ARCHIVE").sha256" "s3://$BACKUP_S3_BUCKET/zivoplus/" --only-show-errors
  log "Off-site copy done"
else
  log "⚠️  Off-site copy not set up (BACKUP_S3_BUCKET is empty): this backup is only on this server"
fi

find "$DIR" -name 'zivoplus-*.tar.enc*' -mtime +"$KEEP_DAYS" -delete
log "Done"
