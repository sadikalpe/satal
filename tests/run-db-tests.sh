#!/usr/bin/env bash
# Şemayı ve erişim kurallarını geçici bir PostgreSQL'de dener.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
tmp="$(mktemp -d)"; trap '"$PGBIN/pg_ctl" -D "$tmp/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
"$PGBIN/initdb" -D "$tmp/data" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$tmp/data" -o "-k $tmp -p 54329 -c listen_addresses=''" -l "$tmp/log" start >/dev/null
P="psql -h $tmp -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database t"
$P -d t -f "$here/auth_stub.sql"
$P -d t -f "$here/../supabase/migrations/20261120000000_init.sql"
$P -d t -f "$here/rls_test.sql"
echo "DB tests passed"
