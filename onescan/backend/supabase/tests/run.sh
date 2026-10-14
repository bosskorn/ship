#!/usr/bin/env bash
# Runs the account migration tests on a throwaway database.
#   PGHOST=... PGPORT=... PGUSER=postgres backend/supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="onescan_account_test_$$"
createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT
for role in anon authenticated service_role; do psql -q -d postgres -c "drop role if exists $role" >/dev/null 2>&1 || true; done
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/auth_stub.sql"
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/../migrations/20261014000000_account_foundation.sql"
# Re-running the migration must be safe.
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/../migrations/20261014000000_account_foundation.sql"
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/account_foundation_test.sql"
