#!/usr/bin/env bash
# Run the whole Somba&Teka stack on your own machine (API + web) with demo data.
#   bash scripts/run-local.sh          # first run installs, seeds and starts
#   RESET=1 bash scripts/run-local.sh  # wipe the local database and re-seed
# Needs only Node 22+ and npm. Uses SQLite, so no database server is required.
# Web http://localhost:3000   API http://localhost:3001   Stop with Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")/.."
API_PORT="${API_PORT:-3001}"; WEB_PORT="${WEB_PORT:-3000}"
DB="$PWD/api/somba.local.sqlite"

major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$major" -ge 22 ] || { echo "Node 22 or newer is required (found: $(node -v 2>/dev/null || echo none)). Install from https://nodejs.org"; exit 1; }

[ -d api/node_modules ] || (cd api && npm ci --no-audit --no-fund)
[ -d web/node_modules ] || (cd web && npm ci --no-audit --no-fund)

export NODE_ENV=development DB_TYPE=sqlite DB_SQLITE_FILE="$DB" DB_SYNCHRONIZE=true MM_PROVIDER=sandbox PORT="$API_PORT"
[ "${RESET:-0}" = 1 ] && rm -f "$DB"
(cd api && npm run build >/dev/null)
if [ ! -f "$DB" ]; then echo "Seeding demo data…"; (cd api && npm run seed >/dev/null); fi

printf 'NEXT_PUBLIC_API_URL=http://localhost:%s\nNEXT_PUBLIC_SOCKET_URL=http://localhost:%s\nNEXT_PUBLIC_DEMO_MODE=false\n' "$API_PORT" "$API_PORT" > web/.env.local

cleanup() { kill "$API_PID" "$WEB_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
(cd api && exec node dist/main.js) & API_PID=$!
until curl -sf "http://localhost:$API_PORT/api/v1/health" >/dev/null; do sleep 1; done
(cd web && exec npx next dev -p "$WEB_PORT") & WEB_PID=$!

cat <<MSG

  Somba&Teka is starting
  Web   http://localhost:$WEB_PORT      (first page load compiles, give it ~20 s)
  API   http://localhost:$API_PORT

  Demo logins (password Somba@2026):
    customer@somba.app   seller@somba.app    admin@somba.app
    ops@somba.app        finance@somba.app   warehouse@somba.app   rider@somba.app

  Mobile money is the sandbox: payments stay pending until you confirm them
  (finance@ confirms in the admin portal under Payments).
MSG
wait
