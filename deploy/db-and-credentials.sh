#!/usr/bin/env bash
# =============================================================================
# KOMORIKO: create the MySQL database + user, generate and store every secret, and seed the first admin.
#
# Run ON the droplet, as root, after the code is in $APP_DIR and the API is built (`npm ci && npm run build` in api/).
# deploy/droplet-deploy.sh already does all of this; use this script when you want just the database and credentials step
# (for example on a droplet you set up by hand). Safe to re-run: nothing is overwritten unless you ask.
#
#   ADMIN_EMAIL=you@example.com bash deploy/db-and-credentials.sh
#
# Optional:  ADMIN_NAME="Your Name"        display name of the admin           (default: Administrator)
#            APP_DIR=/opt/somba            where the code lives                (default: /opt/somba)
#            DB_NAME=somba  DB_USER=somba  database and user names             (defaults: somba / somba)
#            ROTATE_DB_PASSWORD=1          generate a NEW database password    (default: keep the stored one)
#            ROTATE_ADMIN_PASSWORD=1       set a NEW admin password            (default: keep the stored one)
#
# What it writes (all root-only or owned by the app user, mode 600; no secret ever goes in argv, history or logs):
#   /etc/somba/secrets.env   JWT_SECRET, JWT_REFRESH_SECRET, DATA_ENCRYPTION_KEY, DB_PASSWORD, ADMIN_PASSWORD
#   $APP_DIR/api/.env        the API's environment (rebuilt from secrets.env + /etc/somba/api.extra.env)
# BACK UP /etc/somba/secrets.env off the server: if DATA_ENCRYPTION_KEY is lost, encrypted customer data is unreadable.
# =============================================================================
set -euo pipefail

ADMIN_EMAIL="${ADMIN_EMAIL:?Set ADMIN_EMAIL=you@example.com (login of the first super-admin)}"
ADMIN_NAME="${ADMIN_NAME:-Administrator}"
APP_DIR="${APP_DIR:-/opt/somba}"
APP_USER="${APP_USER:-somba}"
DB_NAME="${DB_NAME:-somba}"
DB_USER="${DB_USER:-somba}"
CONF_DIR=/etc/somba
SECRETS="$CONF_DIR/secrets.env"
EXTRA="$CONF_DIR/api.extra.env"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo -i)."
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ && "$DB_USER" =~ ^[A-Za-z0-9_]+$ ]] || die "DB_NAME and DB_USER may only contain letters, digits and underscores."
[[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "ADMIN_EMAIL does not look like an e-mail address."
[[ -f "$APP_DIR/api/dist/database/bootstrap-prod.js" ]] || die "Build the API first: cd $APP_DIR/api && npm ci && npm run build"
id "$APP_USER" >/dev/null 2>&1 || die "User '$APP_USER' does not exist (useradd -m -s /bin/bash $APP_USER)."
command -v mysql >/dev/null || die "MySQL is not installed (apt-get install -y mysql-server)."
command -v openssl >/dev/null || die "openssl is required."

# ── 1. Secrets: generated once, never overwritten ────────────────────────────
umask 077
mkdir -p "$CONF_DIR"; chmod 700 "$CONF_DIR"
touch "$SECRETS" "$EXTRA"; chmod 600 "$SECRETS" "$EXTRA"

# get NAME → value from secrets.env ("" when missing); put NAME VALUE → replace or append, atomically.
get() { grep -E "^$1=" "$SECRETS" | head -1 | cut -d= -f2- || true; }
put() {
  local tmp; tmp="$(mktemp "$CONF_DIR/.secrets.XXXXXX")"
  grep -vE "^$1=" "$SECRETS" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  chmod 600 "$tmp"; mv "$tmp" "$SECRETS"
}
ensure() { [[ -n "$(get "$1")" ]] || { put "$1" "$2"; NEW_KEYS+=("$1"); }; }

NEW_KEYS=()
ensure JWT_SECRET "$(openssl rand -hex 32)"
ensure JWT_REFRESH_SECRET "$(openssl rand -hex 32)"
ensure DATA_ENCRYPTION_KEY "$(openssl rand -hex 32)"
ensure DB_PASSWORD "$(openssl rand -hex 16)"
# At least 12 characters with upper, lower, digit and symbol (the admin bootstrap enforces length 12+).
ensure ADMIN_PASSWORD "$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)Aa1!"

ROTATED_DB=0; ROTATED_ADMIN=0
if [[ "${ROTATE_DB_PASSWORD:-0}" == "1" ]]; then put DB_PASSWORD "$(openssl rand -hex 16)"; ROTATED_DB=1; fi
if [[ "${ROTATE_ADMIN_PASSWORD:-0}" == "1" ]]; then put ADMIN_PASSWORD "$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)Aa1!"; ROTATED_ADMIN=1; fi

DB_PASSWORD="$(get DB_PASSWORD)"; ADMIN_PASSWORD="$(get ADMIN_PASSWORD)"
[[ -n "$DB_PASSWORD" && -n "$ADMIN_PASSWORD" ]] || die "Could not read the generated secrets from $SECRETS."

# ── 2. MySQL: database + a dedicated user that can only touch it ─────────────
log "Creating database '$DB_NAME' and user '$DB_USER'"
systemctl enable --now mysql >/dev/null 2>&1 || true
# The password goes in on stdin (never in argv), and the user is limited to localhost and its own database.
mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
# Prove the new login works before going on.
MYSQL_PWD="$DB_PASSWORD" mysql -u "$DB_USER" -h 127.0.0.1 -e "SELECT 1" "$DB_NAME" >/dev/null \
  || die "The '$DB_USER' database login does not work. Check: systemctl status mysql"

# ── 3. The API's environment (rebuilt on every run from secrets.env + extra.env) ──
log "Writing $APP_DIR/api/.env"
ENVFILE="$APP_DIR/api/.env"
TMP="$(mktemp "$APP_DIR/api/.env.XXXXXX")"
{
  # What a public-IP / domain setup needs is set by the deploy script; keep any values already in .env that are not secrets.
  [[ -f "$ENVFILE" ]] && grep -E '^(NODE_ENV|PORT|CORS_ORIGINS|WEB_URL|PUBLIC_API_URL|UPLOAD_DIR|PRIVATE_UPLOAD_DIR)=' "$ENVFILE" || true
  printf 'JWT_SECRET=%s\nJWT_REFRESH_SECRET=%s\nDATA_ENCRYPTION_KEY=%s\n' "$(get JWT_SECRET)" "$(get JWT_REFRESH_SECRET)" "$(get DATA_ENCRYPTION_KEY)"
  printf 'DB_TYPE=mysql\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USERNAME=%s\nDB_PASSWORD=%s\nDB_DATABASE=%s\nDB_SYNCHRONIZE=false\n' "$DB_USER" "$DB_PASSWORD" "$DB_NAME"
  cat "$EXTRA"
} > "$TMP"
grep -q '^NODE_ENV=' "$TMP" || echo 'NODE_ENV=production' >> "$TMP"
chown "$APP_USER:$APP_USER" "$TMP"; chmod 600 "$TMP"; mv "$TMP" "$ENVFILE"

# ── 4. Schema + first admin + base data ──────────────────────────────────────
# The API applies its migrations when it boots; run them here too so the admin can be created now.
log "Applying migrations"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/api' && set -a && . ./.env && set +a && npm run migration:run >/dev/null"

log "Seeding the admin account, categories, DRC geography, settings and the launch warehouse"
# The admin password travels in the process environment, not in argv. bootstrap:prod never deletes or overwrites rows;
# if the admin already exists it keeps it (use ROTATE_ADMIN_PASSWORD=1 and reset the password in the admin portal).
sudo -u "$APP_USER" env ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_NAME="$ADMIN_NAME" \
  bash -c "cd '$APP_DIR/api' && set -a && . ./.env && set +a && npm run bootstrap:prod"

# ── 5. Summary ───────────────────────────────────────────────────────────────
cat <<EOF

══════════════════════════════════════════════════════════════════════════════
 ✅ Database '$DB_NAME' and user '$DB_USER' are ready; the admin account is seeded.
 Admin login:  $ADMIN_EMAIL
EOF
if printf '%s\n' "${NEW_KEYS[@]:-}" | grep -qx ADMIN_PASSWORD || [[ $ROTATED_ADMIN == 1 ]]; then
  printf ' Admin password (shown ONCE, save it now and change it after the first sign-in):\n               %s\n' "$ADMIN_PASSWORD"
else
  echo " Admin password: unchanged (stored in $SECRETS)"
fi
[[ $ROTATED_DB == 1 ]] && echo " Database password was rotated: restart the API (sudo -u $APP_USER pm2 reload somba-api --update-env)."
cat <<EOF

 🔐 Back up $SECRETS off this server (DATA_ENCRYPTION_KEY protects customer data):
      scp root@<DROPLET_IP>:$SECRETS ./somba-secrets.env.BACKUP
 Integrations (pawaPay, Stripe, SMTP, SMS, translation): add KEY=VALUE lines to $EXTRA and re-run this script.
══════════════════════════════════════════════════════════════════════════════
EOF
