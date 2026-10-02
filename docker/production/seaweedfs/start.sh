#!/bin/sh
# SeaweedFS production (feature 38): identitas S3 dari env, bukan kredensial admin.
#   app    → hanya bucket aplikasi (API membuat bucket saat start → Admin:<bucket>)
#   backup → baca-saja bucket aplikasi (service backup)
# Tidak ada identitas admin global. Port S3 tidak dibuka ke host (hanya jaringan Docker).
set -eu

: "${S3_BUCKET:?}" "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}" "${STORAGE_BACKUP_ACCESS_KEY_ID:?}" "${STORAGE_BACKUP_SECRET_ACCESS_KEY:?}"

umask 077
cat > /tmp/s3.json <<JSON
{
  "identities": [
    {
      "name": "app",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }],
      "actions": ["Admin:${S3_BUCKET}", "Read:${S3_BUCKET}", "Write:${S3_BUCKET}", "List:${S3_BUCKET}", "Tagging:${S3_BUCKET}"]
    },
    {
      "name": "backup",
      "credentials": [{ "accessKey": "${STORAGE_BACKUP_ACCESS_KEY_ID}", "secretKey": "${STORAGE_BACKUP_SECRET_ACCESS_KEY}" }],
      "actions": ["Read:${S3_BUCKET}", "List:${S3_BUCKET}"]
    }
  ]
}
JSON

exec weed server -dir=/data -s3 -s3.config=/tmp/s3.json
