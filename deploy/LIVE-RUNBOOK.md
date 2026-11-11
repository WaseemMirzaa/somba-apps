# Live server runbook (DigitalOcean droplet 107.170.116.169)

One page from "code merged to `main`" to "client testing". Every command below is copy-pasteable and was checked against the
script it calls. Where it runs: **root** means a root shell on the droplet (`ssh root@107.170.116.169`, then it stays root);
**somba** means the app user (`sudo -u somba ...` from root). No secret is ever typed on a command line.

What lives where on the droplet:

| Thing | Path |
|---|---|
| Code (a git clone, reset to `origin/<BRANCH>` on every deploy) | `/opt/somba` |
| Generated secrets (JWT, `DATA_ENCRYPTION_KEY`, DB password, `ADMIN_PASSWORD`), root only | `/etc/somba/secrets.env` |
| Optional API keys that survive deploys (written by `set-secret.sh`), root only | `/etc/somba/api.extra.env` |
| Browser (web build) keys, root only | `/etc/somba/web.env` |
| Demo accounts and passwords, root only | `/etc/somba/demo-credentials.txt` |
| What the API actually reads (rebuilt from the files above on every deploy) | `/opt/somba/api/.env` |
| Uploads and KYC documents (never deleted by a deploy) | `/var/lib/somba/uploads`, `/var/lib/somba/uploads-private` |
| Nightly backup (03:15, 14 days) | `/var/backups/somba` |
| Processes (pm2, user `somba`) | `somba-api` (port 3001), `somba-web` (port 3000), behind nginx on 80 |

Back up `/etc/somba/secrets.env` off the server. If `DATA_ENCRYPTION_KEY` is lost, every customer's e-mail, phone and address is
unrecoverable.

---

## 1. Update the server to the latest `main`

Runs as **root**. Safe on a running server: secrets, data, the admin and uploads are kept. It pulls into `/opt/somba`, installs
and builds the API and the web (a few minutes), restarts both under pm2, the API applies pending migrations on boot, then
`bootstrap:prod` runs (it only adds what is missing, never deletes).

```bash
curl -fsSL https://raw.githubusercontent.com/waseemmirzaa/somba-apps/main/deploy/droplet-deploy.sh -o deploy.sh
DOMAIN=107.170.116.169 ADMIN_EMAIL=you@example.com SSL=0 bash deploy.sh
```

| Variable | Meaning |
|---|---|
| `DOMAIN` (required) | the droplet IP, or a hostname pointing at it |
| `ADMIN_EMAIL` (required) | login of the first super-admin (an existing admin is left unchanged) |
| `SSL` | `1` = Let's Encrypt certificate (hostname only). Default `0` for an IP, `1` for a hostname. An IP with `SSL=1` is refused |
| `BRANCH` | branch to deploy (default `main`). Use it to test a branch: `BRANCH=my-branch DOMAIN=... bash deploy.sh` |
| `REPO` | git URL (default `https://github.com/waseemmirzaa/somba-apps.git`) |
| `ADMIN_NAME` | display name of a newly created admin (default `Administrator`) |

Use the same `DOMAIN`, `ADMIN_EMAIL` and `SSL` every time: `DOMAIN` becomes `CORS_ORIGINS`, `WEB_URL`, `PUBLIC_API_URL` and the
web build's API address. The script installs Node 22, nginx, MySQL 8, pm2, ufw and (with `SSL=1`) certbot. It does **not** install
Docker. It never runs the demo seed.

A key added to `/etc/somba/api.extra.env` or `/etc/somba/web.env` by hand needs this command again to take effect.
Use `set-secret.sh` (section 6) instead for API keys: it needs no redeploy.

## 2. Check that it works

```bash
curl -fsS http://107.170.116.169/api/v1/health          # anywhere; expect {"status":"ok","db":"mysql",...}
sudo -u somba pm2 status                                 # root: somba-api and somba-web must both be "online"
sudo -u somba pm2 logs somba-api --lines 100             # root: Ctrl+C to stop following
sudo -u somba pm2 logs somba-web --lines 100
curl -fsS http://127.0.0.1:3001/api/v1/health            # root: the API directly, bypassing nginx
nginx -t && tail -n 50 /var/log/nginx/error.log          # root: proxy problems
```

On boot the API logs `Production config validated` (and warnings for each missing optional integration, which are normal).

## 3. Seed the demo data

Runs as **root**, after section 1 has deployed a `main` that contains the seed. It only **adds** (a second run adds nothing),
takes about 30 seconds and reloads the API. Full detail, the scenarios per account and the removal rules:
[`DEMO-SEED.md`](DEMO-SEED.md).

```bash
bash /opt/somba/deploy/seed-demo.sh
```

To choose the one password every demo account gets (12+ characters), read it without it entering shell history or `ps`:

```bash
read -rs DEMO_PASSWORD && export DEMO_PASSWORD
bash /opt/somba/deploy/seed-demo.sh
unset DEMO_PASSWORD
```

(Without `DEMO_PASSWORD` the script generates two random ones: customers and store owners share one, staff share another.)
An account that already exists keeps its password unless you run `reset` (section 5).

Cash on delivery is off, so the two cash-on-delivery demo orders are skipped. `bash /opt/somba/deploy/seed-demo.sh --with-cod` (or
`DEMO_WITH_COD=1`) switches `codEnabled` on and makes them; it is the only setting the seed ever changes, and the removal leaves it on
(turn it off as in section 7).

Express delivery is off too, so the express demo orders of store C are skipped. `seed-demo.sh --with-express` (or
`DEMO_WITH_EXPRESS=1`) switches `expressDeliveryEnabled` on and makes them (it changes only that setting; the removal leaves it on).
**Do that only once the client has installed the current rider app build** (section 9): it is the one that knows the express job.
The two flags can be given together.

**While the demo is installed, real visitors can see it** (stores, products, notices to real admins), and
`admin.super@demo.sombateka.test` can do everything. Remove it before real customers arrive (section 5).

## 4. Credentials

| What | Where |
|---|---|
| Your real admin login | the `ADMIN_EMAIL` you passed. Password: `ADMIN_PASSWORD` in `/etc/somba/secrets.env`; read it with `grep '^ADMIN_PASSWORD=' /etc/somba/secrets.env` (root). It was also printed once by the first deploy. If you changed it in the app, the file is stale |
| Demo accounts, passwords, two-factor keys | `cat /etc/somba/demo-credentials.txt` (root, mode 600, never in git or on screen by itself) |
| Two-factor code of a **demo** account (admins and store owners A, B, D, E, F, G, H) | `bash /opt/somba/deploy/seed-demo.sh code seller.a@demo.sombateka.test` (root; replace the e-mail; the code lasts about 30 seconds). Or add that account's `totp_key` as a setup key in an authenticator app. Each `recovery_codes` entry works once instead of a code |
| Two-factor code of your **real** admin | not available from any script: use the authenticator app you enrolled (the script only reads demo accounts) |
| List, rename or remove admin accounts | `cd /opt/somba/api && sudo -u somba npm run manage:admin:prod -- list` (root). See `docs/DEPLOYMENT.md` step 6 for `update-email` and `remove` |

Sign in at `http://107.170.116.169/login` (stores, admins, warehouse and riders use the web portal; customers use the app or `/shop`).

## 5. Reset or remove the demo

All run as **root**:

```bash
bash /opt/somba/deploy/seed-demo.sh reset                # same as seeding, and every demo account gets a NEW password
bash /opt/somba/deploy/seed-demo.sh remove               # shows what would be removed, changes nothing
bash /opt/somba/deploy/seed-demo.sh remove --yes         # removes it (and /etc/somba/demo-credentials.txt) and reloads the API
```

To refresh the dates (the "delivered 2 days ago" order ages), run `remove --yes`, then seed again. Removal finds the demo only through
accounts ending in `@demo.sombateka.test`; it refuses, and deletes nothing, while a real order still contains a demo product or
uses the demo warehouse or a demo rider.

## 6. Keys: what each one turns on and where it goes

Three places, three methods. After every change, check with section 2.

**API keys** (root): `bash /opt/somba/deploy/set-secret.sh NAME` asks for the value with a hidden prompt, checks its shape,
writes `/etc/somba/api.extra.env` and `/opt/somba/api/.env` (mode 600), reloads the API and prints only `NAME set (…last4)`.
Several at once, from your own machine (the values never touch the droplet's history):
`age -d -i somba-payments.key keys.age | ssh root@107.170.116.169 'bash /opt/somba/deploy/set-secret.sh --stdin'` with `NAME=VALUE` lines.
Never paste a key into a shell line, a chat or a file by hand.

**Web keys** (root): `bash /opt/somba/deploy/set-secret.sh --web NAME` writes `/etc/somba/web.env` only (the API is not
touched). They are baked into the web bundle, so **rebuild afterwards** by re-running the deploy (section 1). Only the names in the
table below are copied into the build.

**App keys**: GitHub repository **Settings > Secrets and variables > Actions**. Add them, then re-run the APK workflow
(**Actions > Customer App · Build APK** or **Rider App · Build APK > Run workflow**). The app reads them at build time as `--dart-define`s.

| Key (name) | Turns on | Required? | Goes in | Where to get it / what to register |
|---|---|---|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATA_ENCRYPTION_KEY`, `DB_PASSWORD`, `ADMIN_PASSWORD` | the API itself | required, **generated by the deploy** | `/etc/somba/secrets.env` | Do not set by hand. The API refuses to boot in production with missing or dev-default secrets |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `MAIL_FROM` | verification and password-reset e-mail, team invitations | optional, but with `requireVerifiedForCheckout` on you need **SMS or e-mail** or nobody can order | API: `set-secret.sh NAME` | SendGrid example: host `smtp.sendgrid.net`, port `587`, user `apikey`, password = the `SG.` API key. See `docs/DEPLOYMENT.md` "Turning on e-mail with SendGrid" |
| `TWILIO_ACCOUNT_SID` `TWILIO_AUTH_TOKEN` `TWILIO_FROM` | SMS codes | optional (see above) | API: `set-secret.sh NAME` | Twilio console, Account Info; `TWILIO_FROM` is a number, an `MG...` Messaging Service SID or a sender name |
| `GOOGLE_TRANSLATE_API_KEY` | chat, question and review translation | optional | API: `set-secret.sh NAME` | Google Cloud, enable Cloud Translation API. `TRANSLATE_PROVIDER`: `google` or `off` only. **`fake` is refused** by `set-secret.sh` and by the API at boot in production. `TRANSLATE_DAILY_CHAR_LIMIT` caps daily use |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | push notifications (server side) | optional | API: `set-secret.sh FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase console > Project settings > Service accounts > Generate new private key; paste the JSON (or its base64) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` `_AUTH_DOMAIN` `_PROJECT_ID` `_SENDER_ID` `_APP_ID` `_VAPID_KEY` | web push in the seller, admin and warehouse portals | optional | Web: `set-secret.sh --web NAME`, then redeploy | Firebase console: add a **Web app** for the first five; Cloud Messaging > Web Push certificates for the VAPID key. Needs HTTPS (localhost is exempt) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | address map and pin on the web | optional (without it, manual address entry) | Web: `set-secret.sh --web NAME`, then redeploy | Maps JavaScript + Places + Geocoding APIs; restrict the key by HTTP referrer to the site's address |
| `GOOGLE_MAPS_API_KEY` (secret) | map, place search and pin in the customer and rider **apps** | optional (without it, "Use my current position") | GitHub **secret** `GOOGLE_MAPS_API_KEY` | Maps SDK for Android/iOS, Places API (New), Geocoding API. The native SDK also needs it in `android/local.properties` for local builds, see `mobile/README.md` |
| `FIREBASE_API_KEY` `FIREBASE_PROJECT_ID` `FIREBASE_SENDER_ID` `FIREBASE_ANDROID_APP_ID` `FIREBASE_IOS_APP_ID` `FIREBASE_IOS_BUNDLE_ID` (secrets) | push in the customer and rider apps | optional | GitHub **secrets** with the same names | Firebase console > Project settings > your Android/iOS app. **APNs (iPhones):** Apple Developer > Keys > new key with Apple Push Notifications service, download the `.p8`, then Firebase console > Project settings > Cloud Messaging > Apple app configuration > upload it with the Key ID and Team ID. Details: `docs/MOBILE-PUSH.md` |
| `LIVE_API_URL` (variable) | the server address baked into both APKs (`API_URL` and `SOCKET_URL`) | required for an APK that reaches this server | GitHub **variable** `LIVE_API_URL`, e.g. `http://107.170.116.169` | Plain HTTP is allowed by the apps only for this IP (`network_security_config.xml`); any other host needs HTTPS. Without the variable the workflows default to `http://107.170.116.169` |
| `MM_PROVIDER` | which mobile-money adapter: `none` (default), `manual`, `pawapay`. `sandbox` is refused in production | optional; without it only the wallet works | API: `set-secret.sh MM_PROVIDER` | see section 7 |
| `PAWAPAY_API_TOKEN` `PAWAPAY_BASE_URL` `PAWAPAY_CURRENCY` `PAWAPAY_FX_RATE` `PAWAPAY_VERIFY_SIGNATURES` | mobile-money collections, refunds and payouts through pawaPay | needed when `MM_PROVIDER=pawapay` (no token = mobile money stays off) | API: `set-secret.sh NAME` | pawaPay dashboard: API token; set the **deposit, refund and payout callback URL** to `https://<your-host>/api/v1/payments/webhook/pawapay`; turn on *Signed callbacks* before `PAWAPAY_VERIFY_SIGNATURES=true`. Base URL `https://api.sandbox.pawapay.io` (default) or `https://api.pawapay.io` (live). `docs/PAYMENTS-PAWAPAY.md` |
| `MM_WEBHOOK_SECRET` | signature secret for a **non-pawaPay** aggregator webhook | optional | API: `set-secret.sh MM_WEBHOOK_SECRET` | give the aggregator `https://<your-host>/api/v1/payments/webhook/mobile-money` |
| `MM_PENDING_TTL_MIN` | minutes before an unpaid mobile-money intent expires | optional (default 15; 1440 with `manual`) | API: `set-secret.sh MM_PENDING_TTL_MIN` | whole minutes |
| `STRIPE_SECRET_KEY` `STRIPE_PUBLISHABLE_KEY` `STRIPE_WEBHOOK_SECRET` `STRIPE_PENDING_TTL_MIN` | card payments | optional; the secret and publishable keys must both be test or both live | API: `set-secret.sh NAME` | Stripe dashboard > Developers > Webhooks > add endpoint `https://<your-host>/api/v1/payments/webhook/stripe` with exactly these events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `refund.updated`, `refund.failed`; reveal its `whsec_...` signing secret. Test and live mode have separate endpoints and secrets. `docs/PAYMENTS-STRIPE.md` |
| `PAYOUT_CLEARANCE_HOURS` | hours a delivered sale ages before a seller can be paid (default 48 in production) | optional | API: `set-secret.sh PAYOUT_CLEARANCE_HOURS` | the admin Settings value "Clearance hours" overrides it |
| `REDIS_URL` | shares realtime rooms between several API processes | optional; not needed with one `somba-api` process, and Redis is not installed by the deploy | API: `set-secret.sh REDIS_URL` | `redis://host:6379` |

Card and webhook endpoints need a public HTTPS address. This server is on plain HTTP at an IP (`SSL=0`), so before real
payments point a hostname at the droplet and deploy with `SSL=1` (section 1); then update `LIVE_API_URL` and rebuild the APKs.
(Stripe's rules on HTTP endpoints in test mode were not checked here.)

## 7. Switching on cash on delivery and mobile money

**Cash on delivery.** It is the platform setting `codEnabled` (off at launch; the server refuses COD orders unless it is exactly
`true`). Related: `codCapUsd` (COD orders above it raise a fraud alert). The admin web page **Admin > Settings > Checkout and
delivery** has the "Cash on delivery" row and the COD cap, **but while COD is off that page shows "Not offered" instead of a
toggle, and hides the cap**, so it cannot switch it on. Switch it on directly (root; nothing needs a restart, the API reads
the setting on each request; users see it after they reopen the app or reload the page):

```bash
mysql somba -e "UPDATE settings SET \`value\`='true' WHERE \`key\`='codEnabled'"
mysql somba -e "SELECT \`key\`,\`value\` FROM settings WHERE \`key\` IN ('codEnabled','codCapUsd')"
```

To turn it off again, set it to `'false'`. Once it is `true` the toggle and the cap appear on the admin page and can be changed there.
(`mysql` as root uses the local socket, the same way `droplet-deploy.sh` creates the database.)

**Mobile money (pawaPay).** Root, in this order, one value at a time (hidden prompt):

```bash
bash /opt/somba/deploy/set-secret.sh PAWAPAY_API_TOKEN
bash /opt/somba/deploy/set-secret.sh PAWAPAY_BASE_URL       # https://api.sandbox.pawapay.io to test, https://api.pawapay.io for live money
bash /opt/somba/deploy/set-secret.sh MM_PROVIDER            # pawapay
```

Then register the callback URL in the pawaPay dashboard (section 6). Without the token the API logs a warning and mobile money stays
off. `MM_PROVIDER=manual` (finance confirms a payment by hand) needs no token.

## 8. The delivery settings

The new delivery settings are **platform settings**, not environment keys: they are set from the admin web page **Admin >
Settings** (Super Admin), not with `set-secret.sh`:
`localDeliveryDays`, `splitDeliveryAfterHours`, `expressDeliveryEnabled`, `expressDeliveryDays`, `expressBaseUsd`,
`expressPerKmUsd`, `expressMaxUsd`, `expressMaxKm`. They appear in **Admin > Settings > Delivery model** once the current `main` is deployed (section 1); the bootstrap fills
their defaults (local 1 day, split after 24 hours, express off, express 0 days, $2 + $0.5/km up to $15, no distance cap). The
**`expressDeliveryEnabled` should stay `false` until the current rider app build is installed on the riders' phones** (an older
build cannot run an express job). The demo seed's `--with-express` switches it on (section 3). The
existing ones sit in the same page under **Checkout and delivery** (`deliveryBaseUsd`, `deliveryPerKmUsd`, `deliveryMaxUsd`,
`deliveryTransferUsd`, `allowInterCityDelivery`, `interCityTransferDays`).

## 9. Install the test APKs

1. On GitHub: **Releases** > the latest `customer-apk-v...` (customer) or the rider release > download `somba-customer.apk`
   (universal) or the rider APK.
2. On the Android phone open the file and allow "install unknown apps" for the browser or file manager when asked.
3. Sign in with a demo customer from `/etc/somba/demo-credentials.txt` (for example `customer.full@demo.sombateka.test`).
4. Remove a debug-signed build before installing a release-signed one (different signatures do not update over each other).

More: `mobile/README.md` (CI/CD section), `docs/ANDROID-RELEASE-SIGNING.md`. iPhones need TestFlight with the owner's Apple account
(manual, not built here).

## 10. Troubleshooting

| Symptom | What to do (root) |
|---|---|
| Deploy stops with "Run as root" / "targets Ubuntu" / "SSL=1 needs a hostname" | use `sudo -i`; Ubuntu only; add `SSL=0` for an IP |
| Deploy ends "API did not become healthy" | `sudo -u somba pm2 logs somba-api --lines 200`. "Refusing to start" lists the exact unsafe setting (for example `TRANSLATE_PROVIDER=fake` or `MM_PROVIDER=sandbox` in `/etc/somba/api.extra.env`): fix it with `set-secret.sh` or by editing that file, then deploy again |
| `set-secret.sh` says `/etc/somba/api.extra.env does not exist` | run the deploy (section 1) first |
| `set-secret.sh` says "could not reload the API" | `sudo -u somba -H pm2 reload somba-api --update-env` |
| A web key change has no effect | `NEXT_PUBLIC_*` is baked at build time: run the deploy again (section 1) |
| `seed-demo.sh` says "not found: deploy first" or the seed command is missing | run section 1 so `/opt/somba/api/dist` is built from a `main` that has the seed |
| Nothing at `http://107.170.116.169` | `sudo -u somba pm2 status`, `nginx -t`, `ufw status`, then the log commands in section 2 |
| Seed or remove refuses | read its message: it names the real orders or settings in the way |
| "Phone code not sent" for a demo customer | SMS needs the Twilio keys and a real number on the account; e-mail needs SMTP (section 6) |
| Login fails for everyone | run the deploy again (section 1): its `bootstrap:prod` step creates the admin when none exists. To change or replace an admin, see `docs/DEPLOYMENT.md` step 6 (`manage:admin:prod`) |
| Restore a backup | see the header of `deploy/backup.sh` |
