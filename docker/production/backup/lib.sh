#!/bin/sh
# Fungsi bersama backup.sh & restore.sh. Env dibaca dari container (lihat docker-compose.prod.yml).

log() {
  echo "[backup] $(date '+%Y-%m-%dT%H:%M:%S%z') $*"
}

require_env() {
  for name in "$@"; do
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
      log "env $name belum di-set"
      exit 1
    fi
  done
}

# restic ke S3 eksternal (Cloudflare R2 / Backblaze B2 / S3 lain) memakai kredensial AWS_* — dipetakan dari BACKUP_S3_*
# agar tidak tertukar dengan kredensial SeaweedFS internal.
setup_restic() {
  require_env RESTIC_REPOSITORY RESTIC_PASSWORD
  export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:-}"
  export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-}"
  export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}"
}

# rclone remote bernama "src" = SeaweedFS internal (kredensial baca-saja). Didefinisikan lewat env, tanpa file config.
setup_rclone_remote() {
  remote="$1" endpoint="$2" key="$3" secret="$4"
  upper=$(echo "$remote" | tr '[:lower:]' '[:upper:]')
  export "RCLONE_CONFIG_${upper}_TYPE=s3"
  export "RCLONE_CONFIG_${upper}_PROVIDER=SeaweedFS"
  export "RCLONE_CONFIG_${upper}_ENDPOINT=$endpoint"
  export "RCLONE_CONFIG_${upper}_ACCESS_KEY_ID=$key"
  export "RCLONE_CONFIG_${upper}_SECRET_ACCESS_KEY=$secret"
  export "RCLONE_CONFIG_${upper}_FORCE_PATH_STYLE=true"
}
