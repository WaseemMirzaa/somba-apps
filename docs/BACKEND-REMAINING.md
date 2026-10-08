# Somba & Teka — Backend: what is built, what remains, how it is deployed

_Companion to `BACKEND-AUDIT.md` and `PRODUCTION-READINESS-AUDIT.md`. Database target: **MySQL 8** (validated on MariaDB in CI-equivalent runs). Firebase is **optional, never enforced**._

## 1. Where we are

| Area | State |
|---|---|
| Backend (NestJS + TypeORM + Socket.IO) | 113 WebSocket handlers, 14 REST endpoints, 33 domains, 31 server-pushed events. MySQL migration `InitialSchema` (33 tables), production bootstrap (admin, categories, settings, hubs). |
| Security | Production boot guard, AES-256-GCM field encryption, bcrypt(12), JWT access/refresh with revocation, helmet, WS + REST throttling, server-authoritative order pricing, suspended-account enforcement at handshake. |
| Account lifecycle | Register, email verification, phone OTP (lockout), forgot/reset, change password, profile + prefs, avatar upload, account deletion, device-token registry. |
| Web (customer + seller + warehouse + rider + admin) | Live hooks on the core flows. Real email/password sign-in on `/login` (demo persona picker only when `NEXT_PUBLIC_DEMO_MODE` is not `false`). |
| Deployment | `docker-compose.yml`, `deploy/nginx/somba.conf`, `deploy/droplet-deploy.sh` (one-command idempotent droplet deploy), GitHub Actions CI incl. MySQL job. |
| Mobile | Flutter apps are **not** verified from this environment (no Flutter SDK). See section 6 for the exact test plan. |

## 2. Remaining work (scope vs backend)

Priority: **P0** blocks real money / launch, **P1** scope feature missing server-side, **P2** scale/ops polish.

| # | Item | Pri | Today | Proposed API / work |
|---|---|---|---|---|
| 1 | **Payment gateway (PSP) + webhooks** | P0 | `PaymentsService` records wallet/COD/mobile-money methods and marks them succeeded internally; no real PSP charge | Pick PSP (Stripe / Flutterwave / mobile-money aggregator). `payments:createIntent {orderId}` -> returns provider session; `POST /api/v1/payments/webhook/:provider` (signature-verified, idempotent) flips payment + order to `confirmed`. Needs PSP credentials. |
| 2 | **COD policy conflict** | P0 | `PAYMENT_INVENTORY.md` says `codEnabled:false`; backend still accepts `cod` | Decision needed. If disabled: reject `cod` in `OrdersService.create` when setting `codEnabled=false` (setting already seeded by bootstrap pattern). |
| 3 | **Guest checkout** | P1 | Scope says enabled; backend requires an account | `orders:createGuest {contact, items, ...}` with OTP-verified phone, or auto-create a shadow customer. |
| 4 | **Proof of delivery** | P1 | `delivery:updateStatus` only | `delivery:complete {taskId, otp, photoUrl}`; OTP generated at dispatch and sent to the customer; photo via `/uploads`. |
| 5 | **Open-box / cross-city delivery flags** | P1 | Not modelled | Boolean columns on `order`/`delivery_task`; fee rules per zone. |
| 6 | **Server-side zone pricing** | P1 | Client sends the fee (capped by `MAX_DELIVERY_FEE_USD`) | `zones` table + `orders.create` derives the fee from `zoneId`; remove client `deliveryFeeUsd`. |
| 7 | **Seller subscription / billing (SF-23)** | P1 | Absent | `subscriptions` entity, `sellers:subscribe`, renewal job, commission tiers. |
| 8 | **Referral (Refer & Earn)** | P1 | Absent | `referrals` entity, code on `users`, wallet credit on first delivered order. |
| 9 | **Follow store, recently viewed, buy again** | P1 | Absent (local only) | `follows:toggle|list`, `recent:track|list`, derive buy-again from orders. |
| 10 | **Catalogue pagination + search** | P2 | `products:list` returns everything | Add `{take, skip, q, category, sort}`; DB indexes on `name`, `category`, `status`. |
| 11 | **Historical analytics** | P2 | Aggregates only | Daily rollup table + `analytics:series {from,to,metric}`. |
| 12 | **Multi-instance Socket.IO** | P2 | In-memory rooms (single instance) | Redis adapter (`@socket.io/redis-adapter`) before running >1 API container. |
| 13 | **Uploads storage** | P2 | Local disk volume (`UPLOAD_DIR`) | Move to DigitalOcean Spaces (S3 API) for durability and CDN. |
| 14 | **Backups + monitoring** | P2 | None | Managed MySQL daily backups (or `mysqldump` cron), Sentry DSN, uptime check on `/api/v1/health`. |
| 15 | **Web pages still on mock data** | P1 | batch-builder, dispatch, transfers, fraud mark-reviewed, role assignment, admin warehouses / support / broadcast contexts, exceptions / exchanges / replacements lists | Handlers already exist (`warehouse:*`, `roles:*`, `support:*`, `broadcasts:*`, `exceptions:*`, `exchanges:*`, `replacements:*`) — wiring only. |
| 16 | **Flutter customer app on mock data** | P1 | 17 files still import `mock_data` (home, product_detail, shop_extra, catalog_extra, browse, order_screens, account_more, returns_extra, search_screen, categories, deals, product_image, product_card, gallery, shop_state, catalog_meta, catalog_live). Forgot/OTP/verify screens not wired to the new auth endpoints. | Wire to `products:list`, `orders:*`, `auth/*`. Requires a Flutter SDK to verify. |

## 3. Firebase — is anything connected, and how is it managed?

* Before this work **nothing** in the repo used Firebase (auth is our own JWT + MySQL).
* Now: **optional FCM push only.** `PushService` is a no-op unless credentials are set, so nothing breaks without Firebase.
  * Backend env: `FIREBASE_SERVICE_ACCOUNT_JSON` (raw JSON or base64) **or** `GOOGLE_APPLICATION_CREDENTIALS` (file path).
  * Device registry: clients call `devices:register {token, platform}` after login and `devices:unregister` on logout. `NotificationsService` pushes to a user's registered devices whenever it creates an in-app notification.
  * Invalid/expired tokens are pruned automatically.
* **Flutter steps (not verifiable here):** add `firebase_core` + `firebase_messaging`, put `google-services.json` / `GoogleService-Info.plist` from the client's Firebase project in the apps, request notification permission, then emit `devices:register` over the existing socket with the FCM token.
* Auth, data and realtime do **not** depend on Firebase. The client can skip it entirely and still have live in-app notifications over WebSocket.

## 4. Deploying on a DigitalOcean droplet

Recommended droplet: Ubuntu 22.04/24.04, 2 vCPU / 4 GB (2 GB works for a pilot), plus a DNS A record pointing the API domain at its IP.

```bash
# on the droplet, as root
git clone https://github.com/WaseemMirzaa/somba-apps.git && cd somba-apps
DOMAIN=api.example.com ADMIN_EMAIL=admin@example.com bash deploy/droplet-deploy.sh
```

The script installs Docker + nginx + certbot, generates secrets into `/etc/somba/secrets.env` (**back this file up — losing `DATA_ENCRYPTION_KEY` makes encrypted data unreadable**), builds the stack, runs migrations, runs `bootstrap:prod` (admin + categories + settings + hubs), configures nginx (WebSocket upgrade, `/uploads/`, 6 MB body limit) and requests a TLS certificate. Re-running it is safe. Never run the demo `seed` on production.

Optional integrations go in `/etc/somba/api.extra.env` (SMTP, Twilio, Firebase, `WEB_URL`, `PUBLIC_API_URL`). Full detail: `docs/DEPLOYMENT.md`.

> **Honesty note:** the script and the production-mode stack were verified in the build sandbox (MySQL/MariaDB, production boot guard, E2E suites). The script itself has **not** been executed on a real droplet — this environment has no DigitalOcean access. First run should be watched.

## 5. API reference (generated from source)

### REST (14 endpoints)

| Method | Path |
|---|---|
| GET | `/` |
| POST | `/api/v1/auth/email/send` |
| POST | `/api/v1/auth/email/verify` |
| POST | `/api/v1/auth/forgot` |
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/logout-all` |
| GET | `/api/v1/auth/me` |
| POST | `/api/v1/auth/phone/send` |
| POST | `/api/v1/auth/phone/verify` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/register` |
| POST | `/api/v1/auth/reset` |
| GET | `/api/v1/health` |
| POST | `/api/v1/uploads` |

### WebSocket request→ack (113 events, 33 domains)

| Domain | Events |
|---|---|
| `products` | `list`, `get`, `create`, `update`, `delete` |
| `categories` | `list`, `create`, `update`, `remove` |
| `orders` | `list`, `create`, `updateStatus`, `refund`, `cancel` |
| `delivery` | `list`, `unassigned`, `accept`, `updateStatus`, `location`, `assign` |
| `wallet` | `get`, `transactions`, `topup` |
| `payments` | `list` |
| `payouts` | `list`, `request`, `approve`, `reject` |
| `disputes` | `list`, `open`, `resolve`, `reject` |
| `addresses` | `list`, `create`, `update`, `remove` |
| `reviews` | `list`, `seller`, `create`, `helpful` |
| `questions` | `list`, `ask`, `answer` |
| `support` | `list`, `open`, `reply`, `setStatus` |
| `promos` | `list`, `validate`, `create` |
| `flashsales` | `list`, `create` |
| `cms` | `list`, `upsert` |
| `settings` | `get`, `set` |
| `sellers` | `list`, `storefront`, `register`, `setStatus`, `stats`, `mine`, `update` |
| `analytics` | `admin`, `warehouse`, `revenue` |
| `audit` | `list` |
| `fraud` | `list`, `setStatus` |
| `customers` | `list`, `setActive` |
| `broadcasts` | `list`, `send` |
| `roles` | `defs`, `staff`, `setRole` |
| `warehouse` | `hubs`, `parcels`, `aged`, `inventory`, `batches`, `buildBatch`, `reconcile`, `transfers`, `createTransfer` |
| `rider` | `earnings`, `tasks` |
| `campaigns` | `list`, `create`, `update`, `setStatus` |
| `replacements` | `list`, `create`, `setStatus` |
| `exchanges` | `list`, `create`, `setStatus` |
| `exceptions` | `list`, `create`, `setStatus` |
| `wishlist` | `list`, `toggle` |
| `notifications` | `list`, `markRead`, `markAllRead` |
| `me` | `get`, `update`, `prefs`, `setPrefs`, `changePassword`, `delete` |
| `devices` | `register`, `unregister` |

### Server-pushed events (31)

`addresses:updated`, `audit:created`, `batch:updated`, `broadcast:created`, `campaign:updated`, `customer:updated`, `delivery:location`, `delivery:updated`, `dispute:created`, `dispute:updated`, `exception:updated`, `exchange:updated`, `fraud:created`, `fraud:updated`, `me:updated`, `notification:new`, `order:created`, `order:updated`, `payment:created`, `payment:updated`, `payout:created`, `payout:updated`, `promo:updated`, `replacement:updated`, `roles:updated`, `seller:updated`, `support:updated`, `transfer:updated`, `wallet:transaction`, `wallet:updated`, `wishlist:updated`


All WebSocket events use request -> ack `{ ok: true, data } | { ok: false, error }`. REST is used only for pre-auth and one-shot flows (auth, uploads, health). Access control is enforced per handler by role.

## 6. Mobile + web test plan (run against the deployed API)

Set the apps to the droplet: API `https://api.example.com/api/v1`, socket `https://api.example.com` (path `/socket.io`).

**A. Smoke (any client)**
1. `GET /api/v1/health` returns ok with `db: up`.
2. Sign in as the bootstrap admin on the web `/login` -> lands in `/admin`; reload keeps the session.
3. Admin creates a product (and a category) -> appears live in an open customer session without refresh.

**B. Customer (mobile + web)**
1. Register with email -> verification email arrives (needs SMTP) -> verify. Without SMTP the link is logged by the API (dev only).
2. Phone OTP (needs Twilio); 5 wrong codes lock the code.
3. Forgot password -> reset link -> login with the new password; old refresh tokens are rejected.
4. Browse -> add to cart -> checkout with wallet top-up / mobile-money method -> order appears as `confirmed`; stock decrements; price is the server price even if the client sends another.
5. Cancel before shipping -> stock restored, wallet refunded.
6. Profile edit + avatar upload, preferences, change password, delete account (socket is closed).
7. Push: with Firebase configured, background the app and trigger an order status change from admin -> device notification.

**C. Seller / warehouse / rider / admin (web)**
1. Seller registers a store; admin approves (`sellers:setStatus`); seller lists a product.
2. Order placed -> warehouse sees the parcel -> admin assigns a rider -> rider accepts, updates status and location (live map updates) -> delivered.
3. Payout request -> admin approves/rejects. Dispute open/resolve. Support ticket reply. Broadcast reaches customers.
4. Suspend a customer in the admin panel -> their live session is disconnected and login is refused.

**D. Resilience**
* Kill and restart the API container: clients reconnect, state intact.
* `docker compose logs api` shows no stack traces during the above.

**Known not-yet-testable (see section 2):** real card/mobile-money charges, guest checkout, proof-of-delivery OTP, subscriptions, referral.

## 7. Decisions needed from the client

1. **PSP** (Stripe / Flutterwave / aggregator) and sandbox credentials.
2. **COD** enabled or disabled at launch.
3. **Guest checkout** in v1, or account required.
4. Whether the Flutter wiring (section 2, #16) happens now — it needs someone with the Flutter SDK to build and verify.
