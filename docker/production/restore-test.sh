#!/bin/sh
# Uji restore berkala (feature 38): pulihkan snapshot restic terbaru ke instance terpisah, nyalakan API di atasnya,
# lalu bandingkan dengan production. Jalankan dari root repo di VPS:
#   sh docker/production/restore-test.sh            (instance uji dibuang setelah selesai)
#   KEEP=1 sh docker/production/restore-test.sh     (biarkan menyala untuk dicek manual di 127.0.0.1:14000)
set -eu

ENV_FILE="${ENV_FILE:-.env.production}"
PROD="${PROD_COMPOSE:-docker compose -f docker-compose.prod.yml --env-file $ENV_FILE}"
TEST="docker compose -f docker/production/restore-test.yml --env-file $ENV_FILE ${RESTORE_TEST_EXTRA:-}"
DB=$(grep '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2-)
PG_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2-)

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    echo "[restore-test] membuang instance uji"
    $TEST --profile app --profile tools down -v --remove-orphans > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

count_query="select 'tabel=' || (select count(*) from pg_tables where schemaname = 'public')
  || ' rls_force=' || (select count(*) from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace and relrowsecurity and relforcerowsecurity)
  || ' migration=' || (select count(*) from drizzle.__drizzle_migrations)
  || ' tenant=' || (select count(*) from tenants) || ' karyawan=' || (select count(*) from employees)
  || ' payroll=' || (select count(*) from payroll_runs) || ' slip=' || (select count(*) from payslips)"

echo "[restore-test] menyalakan instance uji"
$TEST up -d --wait restore-db restore-storage restore-redis
echo "[restore-test] restore snapshot terbaru"
$TEST run --rm restore restore.sh
echo "[restore-test] menyalakan API di atas data hasil restore"
$TEST --profile app up -d --wait --build restore-api
$TEST --profile app exec -T restore-api wget -qO- http://127.0.0.1:4000/health
echo

restored=$($TEST exec -T restore-db psql -U postgres -d "$DB" -tA -c "$count_query")
echo "[restore-test] hasil restore : $restored"
# Production berubah sejak snapshot terakhir — angka boleh sedikit lebih besar di production
current=$($PROD exec -T postgres psql -U "$PG_USER" -d "$DB" -tA -c "$count_query" 2>/dev/null || echo "(production tidak berjalan di mesin ini)")
echo "[restore-test] production   : $current"
echo "[restore-test] SELESAI — catat tanggal uji di docker/production/README.md bagian Riwayat uji restore"
