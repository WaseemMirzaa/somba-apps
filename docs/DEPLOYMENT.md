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

## Quick start (recommended): one command

On a fresh Ubuntu droplet, with the DNS A record already pointing at it:

```bash
git clone https://github.com/WaseemMirzaa/somba-apps.git && cd somba-apps
DOMAIN=api.example.com ADMIN_EMAIL=admin@example.com bash deploy/droplet-deploy.sh
```

`deploy/droplet-deploy.sh` is idempotent: it installs Node 22, nginx, MySQL 8, pm2 and ufw (and certbot when `SSL=1`; it does **not** install Docker), writes
secrets to `/etc/somba/secrets.env` (**back it up** — losing `DATA_ENCRYPTION_KEY`
makes encrypted data unreadable), builds the stack, applies migrations, runs
`bootstrap:prod`, configures nginx (WebSocket upgrade, `/uploads/`, 6 MB body limit,
`trust proxy`) and requests the TLS certificate. Optional integrations (SMTP, Twilio,
Firebase, `WEB_URL`, `PUBLIC_API_URL`) go in `/etc/somba/api.extra.env`. The script builds the web app with
`NEXT_PUBLIC_DEMO_MODE=false`, so `/login` shows the real
email/password form; the demo persona picker appears only when a build sets it to `true`. See `docs/BACKEND-REMAINING.md`
for the mobile/web test plan. The manual walkthrough below is the same thing step by step.

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

Portals sign in against the real backend on `/login` (email + password, JWT).
The demo persona picker is **hidden unless** the web build sets `NEXT_PUBLIC_DEMO_MODE=true` (local demos only: add it to `web/.env.local` and rebuild; docker compose: `NEXT_PUBLIC_DEMO_MODE=true docker compose up --build`).
These seeded accounts exist only on demo boxes where `npm run seed` was run; on
production the only account is the admin created by `bootstrap:prod`.

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

NODE_ENV=production                  # turns on the fail-fast config guard
DB_TYPE=mysql
DB_SYNCHRONIZE=false                 # NEVER true in production — schema comes from migrations
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=somba
DB_PASSWORD=CHANGE_ME_STRONG_DB_PASSWORD
DB_DATABASE=somba
```

> With `NODE_ENV=production` the API **refuses to boot** if a secret is missing or
> still a dev default, if `DATA_ENCRYPTION_KEY` isn't 64 hex chars, if
> `DB_TYPE=sqlite`, or if `DB_SYNCHRONIZE=true`. That is deliberate — read the
> error it prints. **Back up `DATA_ENCRYPTION_KEY`**: losing it makes every
> encrypted email/phone/address unrecoverable.

Optional push notifications (Firebase) — see **Step 6b**.

### Build + seed

```bash
cd ~/somba-apps/api
npm ci
npm run build
```

The schema is created by **migrations** (applied automatically when the API
boots in production; to apply them manually: `npm run migration:run`).

Then create your first admin and the base data. This is **safe to re-run** — it
only inserts what's missing and never deletes anything:

```bash
ADMIN_EMAIL=you@yourdomain.com \
ADMIN_PASSWORD='a-long-random-passphrase-12+chars' \
ADMIN_NAME='Your Name' \
npm run bootstrap:prod
```

The first admin it creates is flagged `mustChangePassword`: `ADMIN_PASSWORD` is only a temporary password, and the first sign-in
(web `/admin`, any portal) shows a "choose a new password" screen before anything else. An admin that already exists is left unchanged.
Staff and riders created in Admin -> Roles get the same treatment; Admin -> Roles can issue a new temporary password for anyone who loses theirs.

**Verification policy.** The bootstrap inserts the setting `requireVerifiedForCheckout=true`:
a customer must have a verified phone number **or** e-mail before `orders:create` and
`wallet:topup` work (the error tells them to verify under Profile → Verification). That only
works if at least one verification channel is configured — `SMTP_*` (e-mail link) and/or
`TWILIO_*` (SMS code). Until one is, set it to `false` in Admin → Settings, otherwise nobody
can check out. The setting is public, so the apps can show the prompt up front. The dev seed
leaves it `false`. Seller subscription plans live in the `sellerPlans` setting (JSON, defaults
inserted by the bootstrap; edit in Admin → Settings). Dashboard figures bucket by UTC day, so run
MySQL with its time zone on UTC.

> ⚠️ **Do NOT run `npm run seed` on a production server.** It is demo-data only:
> it **wipes every table** and creates accounts that share the public password
> `Somba@2026`. The demo credentials in Step 0 exist only on a staging/demo box
> where you deliberately ran `npm run seed`. On production, the only login is the
> admin you create above; create staff via the admin panel.
>
> The seed now enforces this itself: it exits without touching anything when `NODE_ENV=production`, or when the database
> already holds accounts it did not create, unless `I_UNDERSTAND_THIS_WIPES_EVERYTHING=1` is set for that one command.

#### Changing or recreating the admin account

The admin panel only lets a signed-in admin change their own **password** and
two-factor settings (Admin → My account) — there's no "change e-mail" field, and
`bootstrap:prod` only ever creates the *first* admin, leaving an existing one
alone. To change an admin's e-mail, or remove one and start fresh, run
`manage:admin` on the server (safe to run any time; `list` and a `remove` without
`--yes` change nothing):

```bash
cd ~/somba-apps/api

# see every admin account
npm run manage:admin:prod -- list

# change an existing admin's e-mail (keeps the same password, name, 2FA)
npm run manage:admin:prod -- update-email old@yourdomain.com new@yourdomain.com

# remove an admin — first a dry run (shows who, changes nothing)
npm run manage:admin:prod -- remove old@yourdomain.com
# then, once you're sure:
npm run manage:admin:prod -- remove old@yourdomain.com --yes

# create a replacement admin (bootstrap:prod only creates if none exists)
ADMIN_EMAIL=new@yourdomain.com ADMIN_PASSWORD='a-long-random-passphrase-12+chars' npm run bootstrap:prod
```

It only ever touches accounts with `role = admin` — pointing it at a seller,
rider or customer's e-mail by mistake fails loudly instead of changing them.

### 6b. (Optional) Firebase push notifications

1. Firebase console → *Project settings → Service accounts → Generate new private key*.
2. Put the JSON in `api/.env` as one line (raw JSON or `base64 -w0 key.json`):
   `FIREBASE_SERVICE_ACCOUNT_JSON=<json-or-base64>`
3. `pm2 restart somba-api` — the log line *“Push disabled …”* disappears.

The mobile apps register their FCM token over the socket (`devices:register`);
the API then pushes every notification to a closed app. Without this variable the
API runs normally and delivers in-app only.

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
NEXT_PUBLIC_DEMO_MODE=false
EOF

npm ci
npm run build
```

> **Scripted deploy (`deploy/droplet-deploy.sh`):** it writes `web/.env.local` itself on every run. Values that must
> survive a redeploy go in `/etc/somba/web.env` (root-only), one `NAME=value` per line without quotes or spaces.
> Only `NEXT_PUBLIC_FIREBASE_*` (web push, including `NEXT_PUBLIC_FIREBASE_VAPID_KEY`) and
> `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (web address map, optional) are copied from it;
> any other line is ignored. Without the Maps key the address map is off and manual entry still works.

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

On a server set up with `deploy/droplet-deploy.sh` (the code lives in `/opt/somba`, run by pm2 as user `somba`), you update by
running the same script again **as root**. It is idempotent: it pulls the branch into `/opt/somba`, rebuilds the API and web,
reloads pm2, lets the API apply pending migrations on boot, runs `bootstrap:prod` (adds what is missing, never deletes), and keeps
your secrets, data and uploads.

```bash
curl -fsSL https://raw.githubusercontent.com/waseemmirzaa/somba-apps/main/deploy/droplet-deploy.sh -o deploy.sh
DOMAIN=your.domain ADMIN_EMAIL=you@example.com bash deploy.sh      # an IP: DOMAIN=<ip> ... SSL=0
```

The full operator page (check, seed demo data, credentials, API/web/app keys, COD and mobile money, test APKs, troubleshooting) is
[`deploy/LIVE-RUNBOOK.md`](../deploy/LIVE-RUNBOOK.md).

Backups: the script installs a nightly dump (`/var/backups/somba`, 14 days); take one by hand with `somba-backup` before a risky
change. Never run `npm run seed` on production: it wipes all data. (Demo data on a server goes through `deploy/seed-demo.sh`, which only
adds and can be removed: see `deploy/DEMO-SEED.md`.)

When you change an entity, generate a migration and commit it (see `api/src/database/migrations/`):
`npm run migration:generate -- src/database/migrations/<Name>`.

If you built the server by hand with steps 1 to 11 above instead (code in `~/somba-apps`), the manual update is:
`git pull`, then `npm ci && npm run build` in `api/` and in `web/`, then `pm2 restart all` (back up with `mysqldump somba > backup.sql` first).

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Socket stuck "connecting" | nginx `/socket.io/` block missing the `Upgrade`/`Connection` headers, or you're on HTTP while the site is HTTPS. |
| `NEXT_PUBLIC_*` changes ignored | They're baked at build time — rerun `npm run build` then `pm2 restart somba-web`. |
| API won't boot | Check `pm2 logs somba-api`; usually MySQL creds in `api/.env` or `DATA_ENCRYPTION_KEY` not 64 hex chars. |
| `ER_ACCESS_DENIED` | Recheck the MySQL user/grant in Step 4 and `DB_*` in `api/.env`. |
| Login fails for everyone | Run `npm run bootstrap:prod` (Step 6) to create the admin. Demo accounts only exist if you ran `seed` on a demo box. |
| API exits with “Refusing to start” | Production guard — the log lists exactly which secret/DB setting is unsafe. |
| Native module build error | `sudo apt install -y build-essential` then `npm ci` again. |

## Production hardening checklist

- [ ] Rotate all demo passwords and the three secrets; never commit `.env`.
- [x] `DB_SYNCHRONIZE=false` + migrations (enforced by the production guard).
- [ ] Back up `DATA_ENCRYPTION_KEY` somewhere other than the droplet.
- [ ] Replace the mock payment gateway before taking real money (see docs/BACKEND-REMAINING.md).
- [ ] Restrict `CORS_ORIGINS` to your real domain(s).
- [ ] Enable automatic security updates (`unattended-upgrades`).
- [ ] Take DigitalOcean backups / a managed MySQL if this goes real.

## Verification codes, translation and maps: what must be set on the server

The apps ask the server what it can do (`settings:get` returns `smsVerification`, `emailVerification` and `translation` as
`on` or `off`, computed from the environment) and say so instead of showing a code that was never sent or a "See translation"
link that can only fail.

| What | Set on the server | If missing |
|---|---|---|
| Phone codes by SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | the verification screen says text messages are not available and offers e-mail |
| E-mail links (verify, reset password) | `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`); see "Turning on e-mail with SendGrid" below | same, for e-mail |
| Chat, question and review translation | `GOOGLE_TRANSLATE_API_KEY` (Cloud Translation API enabled for its project); optional `TRANSLATE_DAILY_CHAR_LIMIT` | translation links are hidden |
| Maps in the customer and rider apps | the same Maps key in `mobile/android/local.properties` and `mobile/ios/Flutter/Secrets.xcconfig` (and the rider app's) at build time, plus `--dart-define=GOOGLE_MAPS_API_KEY` | the app offers "Use my current position" instead of the map |
| Map on the web | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `/etc/somba/web.env`, then rebuild the web; the key's HTTP referrers must include the site's address | the address form asks for manual entry |

With `requireVerifiedForCheckout` on and neither SMS nor e-mail configured, no customer can ever verify, so no one can order: set at least one.

### Turning on SMS codes with Twilio

What the code sends: `POST https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json` with the Account SID and Auth Token as
basic auth. The `To` number is cleaned to `+` and digits first (people type "+243 900 000 101" or "0900000101"; Twilio refuses both
as typed), so every number that normalises as a phone number works. Codes live 10 minutes, allow 5 wrong tries, and a resend is
throttled per account.

From the Twilio console (Account Info and Phone Numbers), take three values:

| Variable | What it is | Shape |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Account SID (not an API key SID, which starts with `SK`) | `AC` + 32 hex characters |
| `TWILIO_AUTH_TOKEN` | Auth Token of the same account | 32 hex characters |
| `TWILIO_FROM` | the sender: a Twilio number, a Messaging Service SID, or an alphanumeric sender name | `+15551234567`, or `MG` + 32 hex, or 3 to 11 letters/digits with a letter |

Set them on the server, as root. The tool checks the shape of each value, writes both `/etc/somba/api.extra.env` (which survives
deploys) and `/opt/somba/api/.env` in one step, reloads the API, and shows only the last four characters of the token:

```bash
bash /opt/somba/deploy/set-secret.sh TWILIO_ACCOUNT_SID     # hidden prompt, then the same for the other two
bash /opt/somba/deploy/set-secret.sh TWILIO_AUTH_TOKEN
bash /opt/somba/deploy/set-secret.sh TWILIO_FROM
```

Then check, without sending anything: the apps' `settings:get` now reports `smsVerification: on` and the verification screen offers
text messages. `pm2 logs somba-api` shows a failed send as `SMS to +243•••01 failed: HTTP 400, Twilio error <code>`; the number and
the code are never logged. Look the code up in Twilio's error list; the usual ones are 21211 (not a valid number), 21608 (trial
account sending to an unverified number), 21408 (country not enabled for this account), 20003 (wrong SID or token) and 21606
(the sender is not an SMS-capable Twilio number).

Things to settle in Twilio before real customers: enable **Geo permissions** for the Democratic Republic of the Congo (and any
other country you sell in), check the sender type the country accepts, and upgrade from the trial account (a trial can only text
numbers you have verified in the console and adds a "trial" prefix). Sending costs money per message; set a spending limit in
Twilio. To try it with your own phone, give the account your own number first.

**Sender for the DRC: you do not need to buy a number.** Twilio's own [guidelines for the DRC](https://www.twilio.com/guidelines/cd/sms)
recommend an alphanumeric sender name (for example `Somba`; avoid generic names such as INFO, Verify or Notify), say that
messages from a numeric sender are not delivered to Airtel subscribers, and say two-way SMS is not supported there (one-way codes
do not need it). Put the name in `TWILIO_FROM`; no Messaging Service is required. Twilio's page lists no registration for sender
names, but another source says Vodacom wants one: ask Twilio support to confirm, then send a test code to a Vodacom and an Airtel
number before launch. Twilio's phone-number search may show no `+243` numbers at all; that is not a problem for this setup.

Release builds of the customer app need the Kotlin keep rules in `mobile/android/app/proguard-rules.pro`; without them R8 removed
classes SharedPreferences needs and sign-up ended in "Something went wrong" after the account had been created.

### Turning on e-mail with SendGrid (SMTP)

The API sends e-mail over SMTP (nodemailer), so SendGrid works through its SMTP relay with no code change. In the SendGrid console:

1. **Sender Authentication.** Authenticate your domain (you add the DNS records SendGrid shows; best for delivery), or at minimum
   verify a single sender address. The address you use as `MAIL_FROM` must be one of these.
2. **API Keys, Create API Key, Restricted Access**, with only *Mail Send* turned on. Copy the key (it starts with `SG.`) at once:
   SendGrid shows it only one time.

| Variable | Value for SendGrid |
|---|---|
| `SMTP_HOST` | `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` (also accepted: 465, 2525, 25; the API uses TLS directly only on 465 and STARTTLS otherwise) |
| `SMTP_USER` | the word `apikey`, exactly |
| `SMTP_PASS` | the API key (`SG.…`) |
| `MAIL_FROM` | the verified address, as `no-reply@yourdomain.com` or `Somba&Teka <no-reply@yourdomain.com>` |

Set them on the server, as root. The same tool as for Twilio checks each value, writes both env files, reloads the API and shows only
the last four characters of the password. It warns, without refusing, when a SendGrid host is used with a user other than `apikey`
or a password that does not start with `SG.`:

```bash
bash /opt/somba/deploy/set-secret.sh SMTP_HOST      # hidden prompt, then the same for each of the other four
bash /opt/somba/deploy/set-secret.sh SMTP_PORT
bash /opt/somba/deploy/set-secret.sh SMTP_USER
bash /opt/somba/deploy/set-secret.sh SMTP_PASS
bash /opt/somba/deploy/set-secret.sh MAIL_FROM
```

Values are stored unquoted, so the tool refuses a password with spaces, quotes, a backslash, `$`, a backtick or `#`, and a
`MAIL_FROM` containing `#` or quotes. Then check: `settings:get` reports `emailVerification: on`, and a sign-up e-mail arrives. A
failed send shows in `pm2 logs somba-api`; the usual causes are a sender address that is not verified in SendGrid and a key without
the Mail Send permission. Share the API key through a password manager, never in chat or a ticket. The tool's checks can be tried on
temp files, touching nothing real, with `bash deploy/tests/set-secret-smtp.test.sh`.

## Mobile money, payouts and delivery zones (production)

| Variable | Purpose |
|---|---|
| `MM_PROVIDER` | `none` (default; mobile money and top-ups are refused — only the wallet works) or the aggregator adapter name. `sandbox` is **rejected** when `NODE_ENV=production`. |
| `MM_WEBHOOK_SECRET` | HMAC secret the aggregator signs webhooks with. Webhook URL to give the aggregator: `https://<domain>/api/v1/payments/webhook/mobile-money`. |
| `MM_PENDING_TTL_MIN` | Minutes before an unpaid intent expires (default 15). |
| `PAYOUT_CLEARANCE_HOURS` | Hours a delivered sale must age before a seller can be paid out (default 48 in production). |

**Payment keys.** Mobile money through pawaPay is in `docs/PAYMENTS-PAWAPAY.md`; bank cards through Stripe are in `docs/PAYMENTS-STRIPE.md`. Either way, put the keys on the server with `deploy/set-secret.sh` (hidden prompt, or `--stdin`; it writes `/etc/somba/api.extra.env` and `/opt/somba/api/.env` atomically, mode 600, reloads the API and prints only the last 4 characters). Never paste a key into a shell line, a chat or a ticket.

* Cash on delivery is **off** by default (`codEnabled=false`); an admin can enable it in Settings.
* Delivery fees are server-side: set the `deliveryZones` setting (list of `{id,name,city,feeUsd}`); checkout requires a valid `zoneId`.
* The nginx config rate-limits `/api/v1/auth/` (10 requests/min/IP, burst 8) on top of the API's own throttling.

## Flutter apps

Build against the deployed API (the apps default to a local dev URL):

```bash
cd mobile     && flutter build apk --release --dart-define=API_URL=https://api.example.com --dart-define=SOCKET_URL=https://api.example.com
cd rider-app  && flutter build apk --release --dart-define=API_URL=https://api.example.com --dart-define=SOCKET_URL=https://api.example.com
```

The rider app needs location permission (declared in its Android manifest) to stream the live position to the customer.
