# Somba&Teka — DigitalOcean Deployment (from scratch)

End-to-end guide to run the **API (NestJS + MySQL + Socket.IO)** and the
**Web portal (Next.js — customer, seller, admin, warehouse, rider)** on a single
Ubuntu droplet behind nginx.

Architecture on one domain (no CORS headaches):

```
                         ┌──────────── nginx (:80/:443) ────────────┐
  browser / mobile  ──▶  │  /socket.io/  → API  :3001  (WebSocket)   │
                         │  /api/        → API  :3001  (REST auth)   │
                         │  /            → Web  :3000  (Next.js)     │
                         └──────────────────────────────────────────┘
                                          │
                                     MySQL :3306  (localhost)
```

> Replace `yourdomain.com` and every password/secret placeholder below with
> your own. Commands assume **Ubuntu 24.04**.

---

## 0. Login / portal credentials (seeded demo accounts)

After you run the seed (Step 7), these accounts exist. **All share the password
`Somba@2026`.** The web portals live under one site:

| Portal (URL path) | Role | Email | Password |
|-------------------|------|-------|----------|
| `/admin` · Admin panel (root) | admin | `admin@somba.app` | `Somba@2026` |
| `/admin` · Operations | admin_operations | `ops@somba.app` | `Somba@2026` |
| `/admin` · Finance (payouts/refunds) | admin_finance | `finance@somba.app` | `Somba@2026` |
| `/seller` · Seller | seller | `seller@somba.app` | `Somba@2026` |
| `/warehouse` · Warehouse | warehouse_staff | `warehouse@somba.app` | `Somba@2026` |
| `/rider` · Rider | rider | `rider@somba.app` | `Somba@2026` |
| `/shop` · Customer | customer | `customer@somba.app` | `Somba@2026` |
| `/live` · Realtime console | any of the above | — | `Somba@2026` |

The **real backend login** (JWT) is on the `/live` console and the mobile apps.
The other portal pages (`/admin`, `/seller`, …) currently use the prototype
persona switcher; the backend session established on `/live` (or in the mobile
apps) is what drives real-time data.

> **Security:** change these before any public launch. Either edit
> `api/src/database/seed.ts` (the `DEMO_PASSWORD` constant + `DEMO_USERS`) and
> re-seed, or register fresh accounts via `POST /api/v1/auth/register` and
> remove the demo users. Never expose the seed password on a production box.

---

## 1. Create the droplet

1. DigitalOcean → **Create → Droplet**.
2. Image **Ubuntu 24.04 LTS**, a **2 GB / 1 vCPU** plan (minimum for building
   Next.js), a datacenter near your users.
3. Auth: add your **SSH key** (recommended) or a strong root password.
4. Create, note the **public IPv4**.
5. Point your domain's **A record** (`@` and `www`) at that IP (skip if using
   the raw IP for now).

---

## 2. First login + a sudo user (permissions)

```bash
ssh root@YOUR_DROPLET_IP

# Create a non-root user with sudo (don't run the app as root)
adduser somba
usermod -aG sudo somba

# Copy your SSH key so you can log in as the new user
rsync --archive --chown=somba:somba ~/.ssh /home/somba

# Reconnect as the app user
exit
ssh somba@YOUR_DROPLET_IP
```

### Firewall (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'     # opens 80 + 443
sudo ufw enable
sudo ufw status
```

Do **not** open 3000/3001 publicly — nginx proxies them from localhost.

---

## 3. Install Node.js + npm, nginx, git

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 22 LTS (matches the project) via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# nginx, git, build tools (better-sqlite3/native deps), pm2
sudo apt install -y nginx git build-essential
sudo npm install -g pm2

node -v && npm -v && nginx -v
```

---

## 4. Install + secure MySQL

```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation      # set a root password, answer Y to the rest
```

### Create the database + a dedicated user

```bash
sudo mysql
```

```sql
CREATE DATABASE somba CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'somba'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_DB_PASSWORD';
GRANT ALL PRIVILEGES ON somba.* TO 'somba'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 5. Get the code

```bash
cd ~
git clone https://github.com/WaseemMirzaa/somba-apps.git
cd somba-apps
```

(For private repos use a deploy key or a personal-access token in the URL.)

---

## 6. Configure the API environment

```bash
cd ~/somba-apps/api
cp .env.example .env

# Generate real secrets (run three times, paste each into .env)
openssl rand -hex 32     # JWT_SECRET
openssl rand -hex 32     # JWT_REFRESH_SECRET
openssl rand -hex 32     # DATA_ENCRYPTION_KEY  (MUST be 64 hex chars)
nano .env
```

Set `api/.env` to point at **MySQL**:

```ini
PORT=3001
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

JWT_SECRET=<paste 64-hex>
JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=<paste a different 64-hex>
JWT_REFRESH_TTL=30d

DATA_ENCRYPTION_KEY=<paste 64-hex>   # encrypts email/phone/address at rest

DB_TYPE=mysql
DB_SYNCHRONIZE=true                  # creates tables on first boot
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=somba
DB_PASSWORD=CHANGE_ME_STRONG_DB_PASSWORD
DB_DATABASE=somba
```

> Keep `DB_SYNCHRONIZE=true` for the first boot so TypeORM creates the schema.
> Once stable you can set it to `false` and manage schema with migrations.

### Build + seed

```bash
cd ~/somba-apps/api
npm ci
npm run build
npm run seed        # creates tables + the demo accounts/catalog from Step 0
```

`npm run seed` prints the account list on success.

---

## 7. Configure + build the Web portal

`NEXT_PUBLIC_*` values are **baked in at build time**, so they must be set
**before** `npm run build`, and point at your public domain (same origin as the
site — nginx routes `/api` and `/socket.io` to the API):

```bash
cd ~/somba-apps/web
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=https://yourdomain.com
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com
NEXT_PUBLIC_MARKET_PROFILE=france
EOF

npm ci
npm run build
```

> Using the raw droplet IP or plain HTTP for now? Use
> `http://YOUR_DROPLET_IP` for both `NEXT_PUBLIC_*` values instead, and
> **rebuild** whenever they change.

---

## 8. Start both apps with PM2

```bash
cd ~/somba-apps
pm2 start deploy/ecosystem.config.cjs
pm2 save                       # persist the process list
pm2 startup systemd            # prints a command — run the sudo line it shows
pm2 status
pm2 logs                       # tail both apps
```

Now `somba-api` (:3001) and `somba-web` (:3000) run on localhost and restart on
reboot.

---

## 9. nginx reverse proxy

```bash
sudo cp ~/somba-apps/deploy/nginx/somba.conf /etc/nginx/sites-available/somba.conf
sudo nano /etc/nginx/sites-available/somba.conf     # set your server_name
sudo ln -s /etc/nginx/sites-available/somba.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                  # test config
sudo systemctl reload nginx
```

The provided config already sends `/socket.io/` and `/api/` to the API and
everything else to Next.js, with the WebSocket `Upgrade` headers set.

Visit `http://yourdomain.com` — the landing page loads; `http://yourdomain.com/live`
lets you sign in with the credentials from Step 0.

---

## 10. HTTPS (Let's Encrypt) — strongly recommended

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# choose "redirect HTTP to HTTPS"
```

Certbot rewrites the nginx config for TLS and auto-renews. With HTTPS the socket
transport is automatically **wss://** — no code change needed.

If you enabled HTTPS, make sure `web/.env.local` uses `https://…`, then rebuild:

```bash
cd ~/somba-apps/web && npm run build && pm2 restart somba-web
```

---

## 11. Verify

```bash
# API health (through nginx)
curl -s https://yourdomain.com/api/v1/health

# Login returns a JWT
curl -s https://yourdomain.com/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@somba.app","password":"Somba@2026"}'
```

Then open `https://yourdomain.com/live` in two browsers (e.g. `admin@somba.app`
and `customer@somba.app`): place an order as the customer and watch it appear
live on the admin session. Point the mobile apps at `https://yourdomain.com`
via `--dart-define` (see `mobile/README.md`).

---

## 12. Updating after a code change

```bash
cd ~/somba-apps
git pull
cd api  && npm ci && npm run build && cd ..
cd web  && npm ci && npm run build && cd ..
pm2 restart all
```

Only run `npm run seed` again if you intend to **wipe and reseed** the database
(it clears existing data).

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Socket stuck "connecting" | nginx `/socket.io/` block missing the `Upgrade`/`Connection` headers, or you're on HTTP while the site is HTTPS. |
| `NEXT_PUBLIC_*` changes ignored | They're baked at build time — rerun `npm run build` then `pm2 restart somba-web`. |
| API won't boot | Check `pm2 logs somba-api`; usually MySQL creds in `api/.env` or `DATA_ENCRYPTION_KEY` not 64 hex chars. |
| `ER_ACCESS_DENIED` | Recheck the MySQL user/grant in Step 4 and `DB_*` in `api/.env`. |
| Login fails for everyone | Run `npm run seed` (Step 6) so the demo accounts exist. |
| Native module build error | `sudo apt install -y build-essential` then `npm ci` again. |

## Production hardening checklist

- [ ] Rotate all demo passwords and the three secrets; never commit `.env`.
- [ ] Set `DB_SYNCHRONIZE=false` and adopt migrations once schema is stable.
- [ ] Restrict `CORS_ORIGINS` to your real domain(s).
- [ ] Enable automatic security updates (`unattended-upgrades`).
- [ ] Take DigitalOcean backups / a managed MySQL if this goes real.
