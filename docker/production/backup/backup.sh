#!/bin/sh
# Satu putaran backup: Postgres (pg_dump custom format) + mirror bucket storage, keduanya ke repository restic.
# Retensi: BACKUP_KEEP_DAILY/WEEKLY/MONTHLY. Gagal → exit ≠ 0 + ping BACKUP_HEALTHCHECK_URL/fail (opsional).
set -eu
. /usr/local/bin/lib.sh

ping_healthcheck() {
  if [ -n "${BACKUP_HEALTHCHECK_URL:-}" ]; then
    curl -fsS -m 10 --retry 3 "${BACKUP_HEALTHCHECK_URL}$1" > /dev/null || log "ping healthcheck gagal"
  fi
}

on_exit() {
  status=$?
  if [ "$status" -ne 0 ]; then
    log "GAGAL (exit $status)"
    ping_healthcheck /fail
  fi
}
trap on_exit EXIT

require_env POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB STORAGE_S3_ENDPOINT STORAGE_S3_BUCKET STORAGE_S3_ACCESS_KEY_ID STORAGE_S3_SECRET_ACCESS_KEY
setup_restic
setup_rclone_remote src "$STORAGE_S3_ENDPOINT" "$STORAGE_S3_ACCESS_KEY_ID" "$STORAGE_S3_SECRET_ACCESS_KEY"
ping_healthcheck /start

# Repository baru → init sekali. Password salah / repo rusak → cat config gagal, init juga gagal (tidak menimpa).
if ! restic cat config > /dev/null 2>&1; then
  log "repository belum ada — restic init"
  restic init
fi

log "postgres: pg_dump $POSTGRES_DB"
# --stdin-from-command: snapshot dibatalkan jika pg_dump gagal (bukan menyimpan dump terpotong)
PGPASSWORD="$POSTGRES_PASSWORD" restic backup --host exapay --tag postgres \
  --stdin-filename "postgres/${POSTGRES_DB}.dump" --stdin-from-command -- \
  pg_dump --host postgres --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --no-password

log "storage: mirror bucket $STORAGE_S3_BUCKET"
# Mirror lokal inkremental (volume backup-staging) lalu snapshot restic — konsisten per objek, tidak menyalin file volume SeaweedFS yang sedang ditulis
mkdir -p /staging/storage
rclone sync "src:${STORAGE_S3_BUCKET}" /staging/storage --checksum --fast-list
restic backup --host exapay --tag storage /staging/storage

log "retensi"
restic forget --host exapay --group-by host,tags --prune \
  --keep-daily "${BACKUP_KEEP_DAILY:-7}" --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" --keep-monthly "${BACKUP_KEEP_MONTHLY:-6}"

# Cek integritas ringan setiap putaran (struktur + 5% data acak)
restic check --read-data-subset=5%

log "selesai"
ping_healthcheck ""
