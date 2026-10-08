# Somba&Teka API — Real-time backend

NestJS backend for the Somba&Teka marketplace. **WebSocket-first**: a one-shot
REST call exchanges credentials for a JWT, then a single authenticated
Socket.IO connection carries every read, write, and live update — no HTTP
polling.

## Architecture

```
              REST (one-shot)                 WebSocket (everything else)
  client ───────────────────────▶  /auth/login ──▶ JWT
  client ══════════════════════════════════════▶  socket.io  (JWT in handshake)
                                                   ├─ request→ack: products/orders/…
                                                   └─ server push: order:*, delivery:*, notification:*
```

- **Auth:** JWT access + refresh (`@nestjs/jwt`), passwords hashed with **bcrypt** (cost 12).
- **Encryption at rest:** email, phone, and addresses are encrypted with
  **AES-256-GCM** (`DATA_ENCRYPTION_KEY`) via a TypeORM column transformer. A
  deterministic `emailHash` enables login lookups without decrypting rows.
- **Database:** TypeORM. `DB_TYPE=sqlite` (local, zero-setup) or `mysql`
  (production). Switch entirely through env — no code change.
- **Real-time rooms:** every socket joins `user:{id}` and `role:{role}`.
  Domain services push events through `RealtimeEmitter`.

## Setup

```bash
npm install
cp .env.example .env          # then fill secrets: openssl rand -hex 32
npm run seed                  # demo users + catalog
npm run start:dev             # http + socket.io on :3001
npm run smoke                 # end-to-end realtime test (server must be running)
```

### Demo accounts (password `Somba@2026`)

| Role | Email |
|------|-------|
| customer | customer@somba.app |
| seller | seller@somba.app |
| admin | admin@somba.app |
| admin_operations | ops@somba.app |
| admin_finance | finance@somba.app |
| warehouse_staff | warehouse@somba.app |
| rider | rider@somba.app |

## REST endpoints (auth + uploads)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/auth/register` | Create account → `{user, accessToken, refreshToken}` |
| POST | `/api/v1/auth/login` | Exchange credentials for tokens |
| POST | `/api/v1/auth/refresh` | Rotate access token (rejected if the session was revoked) |
| POST | `/api/v1/auth/logout-all` | Revoke every token for the user (Bearer token) |
| GET | `/api/v1/auth/me` | Current user (Bearer token) |
| POST | `/api/v1/auth/email/send` · `/email/verify` | Email verification link (token) |
| POST | `/api/v1/auth/phone/send` · `/phone/verify` | Phone OTP (attempt lockout) |
| POST | `/api/v1/auth/forgot` · `/reset` | Password recovery (never reveals whether an account exists) |
| POST | `/api/v1/uploads` | Authenticated image upload (magic-byte checked, size-limited) → public URL under `/uploads/` |
| GET | `/api/v1/health` | Liveness + db type |

Auth and upload endpoints are rate-limited per IP.

## WebSocket protocol

Connect with the access token:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3001', { auth: { token: accessToken } });
socket.on('ready', ({ user }) => { /* connected */ });
```

### Request → ack (client calls, server replies `{ok, data|error}`)

| Event | Body | Who |
|-------|------|-----|
| `products:list` | `{category?, status?}` | all |
| `products:get` | `{id}` | all |
| `orders:list` | – | scoped by role |
| `orders:create` | `{items:[{productId,qty,variant?}], paymentMethod, zoneId?, deliveryFeeUsd?, shippingAddress?}` | customer |
| `orders:updateStatus` | `{orderId, status}` | admin/warehouse |
| `delivery:list` / `delivery:unassigned` | – | rider/ops |
| `delivery:accept` | `{taskId}` | rider |
| `delivery:updateStatus` | `{taskId, status}` | rider |
| `delivery:location` | `{taskId, lat, lng}` | rider |
| `products:create` / `products:update` | product fields | seller/admin |
| `wallet:get` / `wallet:transactions` | – | all |
| `wallet:topup` | `{amountUsd, method?}` | customer |
| `payments:list` | – | scoped |
| `orders:refund` | `{orderId, toWallet?}` | admin/finance |
| `payouts:request` | `{amountUsd, method?}` | seller |
| `payouts:approve` / `payouts:reject` | `{payoutId, note?}` | admin/finance |
| `disputes:open` | `{orderId, type, reason}` | customer |
| `disputes:resolve` / `disputes:reject` | `{disputeId, refund?, resolution?}` | admin |
| `addresses:list/create/update/remove` | address fields | customer |
| `reviews:list/create`, `questions:list/ask/answer` | product review + Q&A | all/customer |
| `support:list/open/reply/setStatus` | support tickets | customer + support |
| `promos:list/validate/create`, `flashsales:list/create` | promotions | all/admin |
| `cms:list/upsert`, `settings:get/set`, `categories:create/update/remove` | content/config | admin |
| `sellers:list/storefront/register/setStatus/stats` | seller lifecycle | seller/admin |
| `analytics:admin/warehouse/revenue` | dashboard KPIs | admin/staff |
| `audit:list`, `fraud:list/setStatus`, `customers:list/setActive` | admin ops | admin |
| `broadcasts:list/send`, `roles:defs/staff/setRole` | marketing + roles | admin |
| `warehouse:hubs/parcels/aged/inventory/batches/buildBatch/reconcile/transfers` | WMS | staff |
| `rider:earnings` / `rider:tasks` | rider shift summary + enriched queue | rider |
| `campaigns:list/create/update/setStatus` | seller marketing campaigns | seller/admin |
| `replacements:list/create/setStatus` | item replacements | customer/ops |
| `exchanges:list/create/setStatus` | item exchanges | customer/ops |
| `exceptions:list/create/setStatus` | warehouse parcel incidents | staff |
| `orders:cancel` | `{orderId}` — restock + refund + void delivery | customer |
| `products:delete` | `{id}` — soft-remove a listing | seller/admin |
| `sellers:update` | `{name?}` — edit own store | seller |
| `wishlist:list` / `wishlist:toggle` | `{productId}` — persistent wishlist | customer |
| `reviews:helpful` | `{id}` — upvote a review | all |
| `delivery:assign` | `{taskId, riderId}` — dispatch to a rider | ops |
| `notifications:list` / `notifications:markRead` / `notifications:markAllRead` | `{id?}` | all |

Account handlers: `me:get|update|prefs|setPrefs|changePassword|delete`,
`devices:register|unregister` (optional FCM push token registry).

**113 realtime handlers across 33 domains and 34 entities** cover every
portal (customer, seller, admin, warehouse, rider) — including marketing
campaigns, replacements, exchanges, and warehouse exceptions.

### Server → client (pushed live, no polling)

| Event | Fired when |
|-------|-----------|
| `order:created` | customer places an order → customer + all ops dashboards |
| `order:updated` | status changes → customer + ops + assigned rider |
| `delivery:updated` | task assigned/advanced → rider + ops |
| `delivery:location` | rider streams position → customer + ops |
| `notification:new` | any notification → target user/role |
| `product:created` / `product:updated` | catalog changes → shoppers + admins |
| `wallet:updated` / `wallet:transaction` | balance change → the wallet owner |
| `payment:created` / `payment:updated` | charge/refund → customer + finance |
| `payout:created` / `payout:updated` | payout lifecycle → seller + finance |
| `dispute:created` / `dispute:updated` | dispute lifecycle → customer + admins |
| `campaign:updated` | campaign created/approved → seller + marketing |
| `replacement:updated` / `exchange:updated` | RMA lifecycle → customer + ops |
| `exception:updated` | parcel incident raised/resolved → ops |
| `me:updated` | profile/prefs changed → that user's other sessions |

The complete generated list of REST endpoints, WebSocket events and pushed events is in
[`docs/BACKEND-REMAINING.md`](../docs/BACKEND-REMAINING.md#5-api-reference-generated-from-source).

## Environment

See [`.env.example`](.env.example). Key vars: `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `DATA_ENCRYPTION_KEY` (64 hex chars), `DB_TYPE`.
In production the API refuses to boot on dev secrets, SQLite or `DB_SYNCHRONIZE=true`;
the schema comes from migrations (`npm run migration:run`) and the first admin from
`npm run bootstrap:prod` (never run `seed` there).

Optional integrations (all no-ops when unset): `FIREBASE_SERVICE_ACCOUNT_JSON` /
`GOOGLE_APPLICATION_CREDENTIALS` (push), `SMTP_HOST/PORT/USER/PASS` + `MAIL_FROM` (email),
`TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM` (SMS), `WEB_URL`, `PUBLIC_API_URL`, `UPLOAD_DIR`,
`UPLOAD_MAX_BYTES`, `WS_RATE_*`, `MAX_DELIVERY_FEE_USD`, `ALLOW_CLIENT_PRICED_ITEMS`.

## Payments, money and security notes

* **Mobile money** (`airtel_money`, `orange_money`, `mpesa`): orders/payments stay `pending` until the signed webhook `POST /api/v1/payments/webhook/mobile-money` (HMAC over the raw body, `MM_WEBHOOK_SECRET`) — or the sandbox provider in development (`MM_PROVIDER=sandbox`). Production default is `MM_PROVIDER=none`: mobile money is refused (fails closed) until an aggregator adapter is configured.
* **COD** is off unless an admin sets `codEnabled=true`. **Account is mandatory** (no guest checkout).
* Prices, promo discounts and delivery fees (`deliveryZones` setting) are computed server-side; stock and wallet moves are atomic.
* Tests: `npm test` (unit), `npm run smoke`, `npm run smoke:account`, `npm run smoke:authz` against a seeded running server (`npm run seed`; the seed switches COD back off after creating demo orders).
