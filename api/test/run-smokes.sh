#!/usr/bin/env bash
# Runs the API smoke scripts against a fresh seeded throw-away SQLite database, one fresh server per suite (so the in-memory
# login rate limit and the demo passwords start clean). Needs `npm run build` first. Usage (from api/):
#   bash test/run-smokes.sh <out dir> [suite ...]
# Suite names are the file names in test/ without `.cjs` (plus `socket`; `account`, `authz` and `flows` are short for *-smoke). Writes <out>/<suite>.log, <suite>.server.log, summary.txt.
# The development-only switches the smokes document in their headers are set here: TRANSLATE_PROVIDER=fake (a deterministic
# "[fr] text" translator; refused in production), MM_PROVIDER=sandbox (refused in production) and short background sweeps.
# after-sale-smoke, r2f-smoke and staff-2fa-fraud-smoke age orders / write rows straight into the API's MySQL database, so
# they cannot run on SQLite: when a MySQL server answers (DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD, default root@localhost
# with no password) they run on a throw-away database with a unique name (somba_smoke_<suite>_<pid>) that is dropped
# afterwards; without MySQL they are reported SKIP. Nothing else in MySQL is touched.
set -u
OUT="${1:?usage: run-smokes.sh <out dir> [suite ...]}"; shift
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
cd "$(dirname "$0")/.."
PORT="${SMOKE_PORT:-3013}"
export NODE_ENV=development DB_TYPE=sqlite DB_SYNCHRONIZE=true PORT
export API_URL="http://localhost:$PORT" SMOKE_API="http://localhost:$PORT"
export TRANSLATE_PROVIDER=fake MM_PROVIDER=sandbox TRANSLATE_SWEEP_MS=1000
export CAMPAIGN_SWEEP_MS=2000 FLASH_SWEEP_MS=2000 AFTER_SALE_SWEEP_MS=1500 VACATION_SWEEP_MS=1500 FRAUD_SWEEP_MS=3000

MYSQL_SUITES=" after-sale-smoke r2f-smoke staff-2fa-fraud-smoke "
MYSQL_ARGS=(-h "${DB_HOST:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_USERNAME:-root}" ${DB_PASSWORD:+-p"$DB_PASSWORD"})
HAVE_MYSQL=0
if command -v mysql >/dev/null 2>&1 && mysql "${MYSQL_ARGS[@]}" -e 'select 1' >/dev/null 2>&1; then HAVE_MYSQL=1; fi

SUITES=("$@")
if [ ${#SUITES[@]} -eq 0 ]; then
  SUITES=(socket account authz flows cod-cash-smoke race-smoke warehouse-stock-smoke coverage-smoke warehouse-routing-smoke
          warehouse-areas-smoke rider-account-smoke i18n-smoke commerce-smoke seller-platform-smoke
          warehouse-ops-smoke gap-features-smoke kyc-smoke multi-seller-smoke p0-fixes-smoke
          rider-compliance-smoke statements-smoke after-sale-smoke r2f-smoke staff-2fa-fraud-smoke)
fi

: > "$OUT/summary.txt"
for s in "${SUITES[@]}"; do
  DB="$OUT/$s.sqlite"; rm -f "$DB" "$DB-wal" "$DB-shm"
  export DB_SQLITE_FILE="$DB"
  MYDB=""
  if [[ "$MYSQL_SUITES" == *" $s "* ]]; then
    if [ $HAVE_MYSQL -eq 0 ]; then echo "SKIP       $s (needs MySQL)" | tee -a "$OUT/summary.txt"; continue; fi
    MYDB="somba_smoke_$(echo "$s" | tr -c 'a-z0-9\n' '_' | cut -c1-20)_$$"
    mysql "${MYSQL_ARGS[@]}" -e "CREATE DATABASE \`$MYDB\` CHARACTER SET utf8mb4"
    export DB_TYPE=mysql DB_DATABASE="$MYDB"
  else
    export DB_TYPE=sqlite; unset DB_DATABASE
  fi
  if ! npm run seed > "$OUT/$s.seed.log" 2>&1; then
    echo "SEED-FAIL  $s" | tee -a "$OUT/summary.txt"
    [ -n "$MYDB" ] && mysql "${MYSQL_ARGS[@]}" -e "DROP DATABASE IF EXISTS \`$MYDB\`"
    continue
  fi
  node dist/main.js > "$OUT/$s.server.log" 2>&1 &
  SERVER=$!
  for i in $(seq 1 40); do curl -sf "$API_URL/api/v1/health" >/dev/null 2>&1 && break || sleep 1; done
  case "$s" in
    socket) CMD=(npx ts-node -r tsconfig-paths/register test/socket-smoke.ts) ;;
    account|authz|flows) CMD=(node "test/$s-smoke.cjs") ;;
    *) CMD=(node "test/$s.cjs") ;;
  esac
  perl -e 'alarm 900; exec @ARGV' "${CMD[@]}" > "$OUT/$s.log" 2>&1
  CODE=$?
  kill "$SERVER" 2>/dev/null; wait "$SERVER" 2>/dev/null
  if [ $CODE -eq 0 ]; then echo "PASS       $s" | tee -a "$OUT/summary.txt"; else echo "FAIL($CODE)  $s" | tee -a "$OUT/summary.txt"; fi
  rm -f "$DB" "$DB-wal" "$DB-shm"
  [ -n "$MYDB" ] && mysql "${MYSQL_ARGS[@]}" -e "DROP DATABASE IF EXISTS \`$MYDB\`"
done
echo DONE >> "$OUT/summary.txt"
