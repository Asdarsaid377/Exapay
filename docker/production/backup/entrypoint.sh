#!/bin/sh
# Mode:
#   (tanpa argumen) → crond, backup.sh dijalankan sesuai BACKUP_CRON (zona waktu TZ)
#   backup.sh | restore.sh | restic … | sh → dijalankan langsung (docker compose run --rm backup …)
set -eu

if [ "$#" -gt 0 ]; then
  # Kredensial restic (BACKUP_S3_* → AWS_*) siap untuk perintah manual, mis. `restic snapshots`
  . /usr/local/bin/lib.sh
  setup_restic
  exec "$@"
fi

# crond busybox tidak meneruskan env container ke job → simpan ke file yang hanya bisa dibaca root
# (export -p mengutip nilai dengan aman)
export -p | grep -E '^export (TZ|POSTGRES_|RESTIC_|BACKUP_|STORAGE_)' > /run/backup.env
chmod 600 /run/backup.env

schedule="${BACKUP_CRON:-30 2 * * *}"
mkdir -p /etc/crontabs
echo "$schedule . /run/backup.env && /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "[backup] terjadwal: '$schedule' (TZ=${TZ:-UTC})"
exec crond -f -l 8
