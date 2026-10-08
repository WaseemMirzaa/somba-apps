#!/usr/bin/env bash
# =============================================================================
# Somba&Teka — one-command deploy to a DigitalOcean droplet (Ubuntu 22.04/24.04)
#
# Run ON the droplet, as root, on a fresh box OR on every update (idempotent):
#
#   curl -fsSL https://raw.githubusercontent.com/waseemmirzaa/somba-apps/<branch>/deploy/droplet-deploy.sh -o deploy.sh
#   DOMAIN=shop.example.com ADMIN_EMAIL=you@example.com bash deploy.sh
#
# Required:  DOMAIN        hostname pointing at this droplet (or the droplet IP)
#            ADMIN_EMAIL   login of the first super-admin
# Optional:  BRANCH        git branch to deploy            (default: main)
#            REPO          git URL                          (default: the project repo)
#            SSL           1 = get a Let's Encrypt cert     (default: 1 if DOMAIN is a hostname)
#            ADMIN_NAME    display name of the admin        (default: Administrator)
#
# What it does:  installs Node 22 + nginx + MySQL 8 + pm2, creates the database,
# generates all secrets ONCE into /etc/somba/secrets.env (root-only), builds the
# API + web, applies migrations, creates the admin, starts both under pm2
# (auto-restart on reboot), configures nginx (+HTTPS) and the firewall, then
# checks health. It NEVER runs the destructive demo seed.
#
# Optional integrations (email, SMS, Firebase push): put KEY=VALUE lines in
# /etc/somba/api.extra.env — they are appended to the API env on every deploy
# and survive updates.  See docs/DEPLOYMENT.md.
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN=your.domain (or the droplet IP)}"
ADMIN_EMAIL="${ADMIN_EMAIL:?Set ADMIN_EMAIL=you@example.com}"
BRANCH="${BRANCH:-main}"
REPO="${REPO:-https://github.com/waseemmirzaa/somba-apps.git}"
ADMIN_NAME="${ADMIN_NAME:-Administrator}"
APP_USER=somba
APP_DIR=/opt/somba
CONF_DIR=/etc/somba
SECRETS="$CONF_DIR/secrets.env"
EXTRA="$CONF_DIR/api.extra.env"

is_ip() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; }
if is_ip "$DOMAIN"; then SSL="${SSL:-0}"; else SSL="${SSL:-1}"; fi
SCHEME=http; [[ "$SSL" == "1" ]] && SCHEME=https
BASE_URL="$SCHEME://$DOMAIN"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo -i)."
[[ -r /etc/os-release ]] && . /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "This script targets Ubuntu (found: ${ID:-unknown})."
[[ "$SSL" == "1" ]] && is_ip "$DOMAIN" && die "SSL=1 needs a hostname, not an IP."

# ── 1. System packages ───────────────────────────────────────────────────────
log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git nginx ufw build-essential openssl mysql-server >/dev/null
[[ "$SSL" == "1" ]] && apt-get install -y -qq certbot python3-certbot-nginx >/dev/null

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != "22" ]]; then
  log "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
command -v pm2 >/dev/null || npm install -g pm2 >/dev/null 2>&1

# ── 2. App user + secrets (generated once, never overwritten) ────────────────
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$CONF_DIR"; chmod 700 "$CONF_DIR"
if [[ ! -f "$SECRETS" ]]; then
  log "Generating secrets → $SECRETS"
  umask 077
  cat > "$SECRETS" <<EOF
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
DATA_ENCRYPTION_KEY=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 16)
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)Aa1!
EOF
  FIRST_RUN=1
else
  FIRST_RUN=0
fi
touch "$EXTRA"; chmod 600 "$EXTRA"
set -a
# shellcheck source=/dev/null
. "$SECRETS"
set +a

# ── 3. MySQL: database + dedicated user (idempotent) ─────────────────────────
log "Configuring MySQL"
systemctl enable --now mysql >/dev/null 2>&1
mysql <<SQL
CREATE DATABASE IF NOT EXISTS somba CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'somba'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER 'somba'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON somba.* TO 'somba'@'localhost';
FLUSH PRIVILEGES;
SQL

# ── 4. Code ──────────────────────────────────────────────────────────────────
log "Fetching code ($BRANCH)"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 5. Environment files ─────────────────────────────────────────────────────
log "Writing environment"
install -m 600 -o "$APP_USER" -g "$APP_USER" /dev/null "$APP_DIR/api/.env"
{
  cat <<EOF
NODE_ENV=production
PORT=3001
CORS_ORIGINS=$BASE_URL
WEB_URL=$BASE_URL
PUBLIC_API_URL=$BASE_URL
UPLOAD_DIR=$APP_DIR/uploads
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
DATA_ENCRYPTION_KEY=$DATA_ENCRYPTION_KEY
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=somba
DB_PASSWORD=$DB_PASSWORD
DB_DATABASE=somba
DB_SYNCHRONIZE=false
EOF
  cat "$EXTRA"
} > "$APP_DIR/api/.env"
mkdir -p "$APP_DIR/uploads"; chown "$APP_USER:$APP_USER" "$APP_DIR/uploads"

# NEXT_PUBLIC_* are baked into the web bundle at BUILD time.
cat > "$APP_DIR/web/.env.local" <<EOF
NEXT_PUBLIC_API_URL=$BASE_URL
NEXT_PUBLIC_SOCKET_URL=$BASE_URL
NEXT_PUBLIC_DEMO_MODE=false
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/web/.env.local"

# ── 6. Build ─────────────────────────────────────────────────────────────────
log "Building API"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/api' && npm ci --no-audit --no-fund && npm run build"
log "Building web (takes a few minutes)"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/web' && npm ci --no-audit --no-fund && npm run build"

# ── 7. Start (the API applies pending migrations on boot) ────────────────────
log "Starting services"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save" >/dev/null
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null 2>&1 || true

log "Waiting for the API to be healthy (migrations run on first boot)"
for _ in $(seq 1 60); do
  curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null 2>&1 && break || sleep 2
done
curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null 2>&1 \
  || die "API did not become healthy. Check: sudo -u $APP_USER pm2 logs somba-api"

# ── 8. First admin + base data (idempotent, never deletes) ───────────────────
log "Creating admin + base data"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/api' && ADMIN_EMAIL='$ADMIN_EMAIL' ADMIN_PASSWORD='$ADMIN_PASSWORD' ADMIN_NAME='$ADMIN_NAME' npm run bootstrap:prod"

# ── 9. nginx ─────────────────────────────────────────────────────────────────
log "Configuring nginx"
sed -e "s/yourdomain.com www.yourdomain.com/$DOMAIN/" -e "s/yourdomain.com/$DOMAIN/g" \
  "$APP_DIR/deploy/nginx/somba.conf" > /etc/nginx/sites-available/somba.conf
ln -sf /etc/nginx/sites-available/somba.conf /etc/nginx/sites-enabled/somba.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 10. Firewall + HTTPS ─────────────────────────────────────────────────────
log "Firewall"
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null

if [[ "$SSL" == "1" ]]; then
  log "HTTPS (Let's Encrypt)"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect \
    || printf '\033[1;33m⚠ certbot failed — is the DNS A record for %s pointing at this droplet? Re-run later: certbot --nginx -d %s\033[0m\n' "$DOMAIN" "$DOMAIN"
fi

# ── 11. Verify through nginx ─────────────────────────────────────────────────
log "Verifying"
curl -fsS -H "Host: $DOMAIN" "http://127.0.0.1/api/v1/health" && echo
curl -fsS -o /dev/null -w "web → HTTP %{http_code}\n" -H "Host: $DOMAIN" "http://127.0.0.1/"

cat <<EOF

══════════════════════════════════════════════════════════════════════════════
 ✅  Somba&Teka is live:  $BASE_URL
──────────────────────────────────────────────────────────────────────────────
 Admin login:   $ADMIN_EMAIL
EOF
if [[ "$FIRST_RUN" == "1" ]]; then
  cat <<EOF
 Admin password (shown ONCE — save it now, then change it in the app):
                $ADMIN_PASSWORD
EOF
else
  echo " Admin password: unchanged (stored in $SECRETS)"
fi
cat <<EOF

 🔐 BACK UP $SECRETS off this server.  DATA_ENCRYPTION_KEY protects every
    customer's email/phone/address — if it is lost, that data is unrecoverable.

 Optional (edit $EXTRA, then re-run this script):
    SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS MAIL_FROM      → reset/verify emails
    TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM        → SMS OTP
    FIREBASE_SERVICE_ACCOUNT_JSON                           → push notifications
    MM_PROVIDER MM_WEBHOOK_SECRET                           → mobile money (without it, mobile
                                                              money is refused; only wallet works)
    Aggregator webhook URL: $BASE_URL/api/v1/payments/webhook/mobile-money
    Then set the delivery zones/fees: admin Settings → deliveryZones
 Logs:   sudo -u $APP_USER pm2 logs
 Update: re-run this same command (idempotent; backs nothing up — run mysqldump first).
══════════════════════════════════════════════════════════════════════════════
EOF
