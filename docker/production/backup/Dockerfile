# Service backup production (feature 38): pg_dump + mirror bucket storage → restic (terenkripsi) → S3 eksternal.
# Versi pg_dump harus sama dengan server Postgres (18).
FROM postgres:18-alpine
RUN apk add --no-cache restic rclone curl
COPY --chmod=755 entrypoint.sh backup.sh restore.sh lib.sh /usr/local/bin/
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
