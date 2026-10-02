#!/bin/sh
# Restore snapshot restic ke database & bucket TARGET (bukan production kecuali disengaja).
#   restore.sh [snapshot postgres] [snapshot storage]     (default: latest masing-masing tag)
# Env target (wajib): RESTORE_PG_HOST RESTORE_PG_USER RESTORE_PG_PASSWORD RESTORE_PG_DB
#                     RESTORE_S3_ENDPOINT RESTORE_S3_BUCKET RESTORE_S3_ACCESS_KEY_ID RESTORE_S3_SECRET_ACCESS_KEY
# Pengaman: database target harus kosong (tanpa tabel di schema public). Menimpa database berisi data
# butuh RESTORE_CONFIRM=<nama database target> — tabel lama di-drop oleh pg_restore --clean.
# Database target harus sudah punya role app_owner & app_user (container postgres dengan docker/postgres/init).
set -eu
. /usr/local/bin/lib.sh

PG_SNAPSHOT="${1:-latest}"
STORAGE_SNAPSHOT="${2:-latest}"
require_env RESTORE_PG_HOST RESTORE_PG_USER RESTORE_PG_PASSWORD RESTORE_PG_DB \
  RESTORE_S3_ENDPOINT RESTORE_S3_BUCKET RESTORE_S3_ACCESS_KEY_ID RESTORE_S3_SECRET_ACCESS_KEY
setup_restic
setup_rclone_remote dst "$RESTORE_S3_ENDPOINT" "$RESTORE_S3_ACCESS_KEY_ID" "$RESTORE_S3_SECRET_ACCESS_KEY"
export PGPASSWORD="$RESTORE_PG_PASSWORD"
PSQL="psql --host $RESTORE_PG_HOST --username $RESTORE_PG_USER --dbname $RESTORE_PG_DB --no-password -v ON_ERROR_STOP=1 -tA"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

tables=$($PSQL -c "select count(*) from pg_tables where schemaname = 'public'")
clean=""
if [ "$tables" != "0" ]; then
  if [ "${RESTORE_CONFIRM:-}" != "$RESTORE_PG_DB" ]; then
    log "database $RESTORE_PG_DB di $RESTORE_PG_HOST berisi $tables tabel. Set RESTORE_CONFIRM=$RESTORE_PG_DB untuk menimpa."
    exit 1
  fi
  clean="--clean --if-exists"
  log "PERINGATAN: menimpa database $RESTORE_PG_DB ($tables tabel)"
fi

log "postgres: snapshot $PG_SNAPSHOT"
restic dump --tag postgres "$PG_SNAPSHOT" "/postgres/${POSTGRES_DB:-exapayroll}.dump" > "$work/db.dump"
# shellcheck disable=SC2086
pg_restore --host "$RESTORE_PG_HOST" --username "$RESTORE_PG_USER" --dbname "$RESTORE_PG_DB" --no-password \
  --exit-on-error --single-transaction $clean "$work/db.dump"
log "postgres: $($PSQL -c "select count(*) from pg_tables where schemaname = 'public'") tabel, $($PSQL -c "select count(*) from drizzle.__drizzle_migrations") migration"

log "storage: snapshot $STORAGE_SNAPSHOT → bucket $RESTORE_S3_BUCKET"
restic restore --tag storage "$STORAGE_SNAPSHOT" --target "$work/files" --include /staging/storage
rclone mkdir "dst:${RESTORE_S3_BUCKET}"
rclone copy "$work/files/staging/storage" "dst:${RESTORE_S3_BUCKET}" --checksum
log "storage: $(rclone size "dst:${RESTORE_S3_BUCKET}" --json)"

log "restore selesai"
