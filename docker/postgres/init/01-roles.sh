#!/bin/sh
# Dijalankan sekali saat volume Postgres masih kosong.
# app_owner: owner DB & schema, dipakai migration. app_user: role runtime API/worker (bukan owner → RLS berlaku).
# Grant tabel & default privileges untuk app_user diatur lewat migration (feature 02).
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" \
  -v owner_pw="$APP_OWNER_PASSWORD" \
  -v user_pw="$APP_USER_PASSWORD" <<'EOSQL'
create role app_owner login password :'owner_pw';
create role app_user login password :'user_pw' nosuperuser nocreatedb nocreaterole;

alter database :"db" owner to app_owner;
alter schema public owner to app_owner;

revoke all on database :"db" from public;
grant connect on database :"db" to app_owner, app_user;
grant usage on schema public to app_user;
EOSQL
