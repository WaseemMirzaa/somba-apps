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

## REST endpoints (auth only)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/auth/register` | Create account → `{user, accessToken, refreshToken}` |
| POST | `/api/v1/auth/login` | Exchange credentials for tokens |
| POST | `/api/v1/auth/refresh` | Rotate access token |
| GET | `/api/v1/auth/me` | Current user (Bearer token) |
| GET | `/api/v1/health` | Liveness + db type |

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
| `notifications:list` / `notifications:markRead` | `{id}` | all |

### Server → client (pushed live, no polling)

| Event | Fired when |
|-------|-----------|
| `order:created` | customer places an order → customer + all ops dashboards |
| `order:updated` | status changes → customer + ops + assigned rider |
| `delivery:updated` | task assigned/advanced → rider + ops |
| `delivery:location` | rider streams position → customer + ops |
| `notification:new` | any notification → target user/role |
| `product:created` / `product:updated` | catalog changes → shoppers + admins |

## Environment

See [`.env.example`](.env.example). Key vars: `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `DATA_ENCRYPTION_KEY` (64 hex chars), `DB_TYPE`.
