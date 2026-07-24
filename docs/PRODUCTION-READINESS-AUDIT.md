# Production-Readiness Audit — Somba&Teka

_Scope: backend (NestJS API), all 17 domain modules, and frontend↔backend
connectivity (Next.js web + Flutter apps). Assessed against real deployment
concerns: security, data integrity, auth, robustness, ops. Evidence is cited by
file. Severity: **P0 blocker** · **P1 high** · **P2 medium** · **P3 polish**._

## Verdict

**Not production-ready as a live multi-user system yet** — the architecture,
domain coverage and data model are solid and fully live, but four **P0
blockers** stand between the current state (an excellent, fully-wired
*demo/prototype*) and a real production launch. All are well-scoped and fixable.

---

## ✅ Already production-grade

- **Transport & CORS:** REST CORS locked to an allow-list; the Socket.IO adapter
  applies the same allow-list (`socket-io.adapter.ts`). WebSocket-first — one
  authenticated socket, no polling.
- **Auth crypto:** bcrypt (cost 12); JWT access+refresh with **token revocation**
  (`tokenVersion`); AES-256-GCM field encryption for email/phone/address with a
  deterministic `emailHash` for lookups.
- **Input pipe:** global `ValidationPipe({ whitelist, transform })` on REST.
- **Rate limiting:** auth REST throttled (30 req/min/IP).
- **Coverage:** 105 role-scoped realtime handlers across 17 modules / 31
  entities; end-to-end smoke passes 26/26; per-flow socket smokes pass.
- **Ops artifacts:** `api/Dockerfile`, `web/Dockerfile`, `docker-compose.yml`,
  `deploy/nginx`, `deploy/ecosystem.config.cjs` (pm2), CI (`ci.yml`: build +
  seed + smoke for API, build for web), health endpoint `/api/v1/health`.

---

## 🔴 P0 — Blockers (must fix before any real launch)

### P0-1 · Frontend auth is a demo shell (no real users)
The login/register form ignores the credentials the user types and signs into a
**shared seeded account**:
```
web/src/components/shop/auth-form.tsx:23   login("customer");   // ignores email/password
web/src/context/auth-context.tsx           persona → backendEmailFor() → seeded account
                                            DEMO_PASSWORD = NEXT_PUBLIC_DEMO_PASSWORD ?? "Somba@2026"
```
Every visitor becomes one of 7 demo accounts. The **real** backend auth
(`/auth/register`, `/auth/login`, `/auth/refresh`) exists and works, but the UI
never calls `useRealtime().login(email, password)` / `.register(...)` with real
input. **Impact:** no real registration, no per-user data, no real sessions.
**Fix:** wire `auth-form.tsx` (and the seller/admin/warehouse entry) to
`useRealtime().login/register`; keep the persona picker only behind a dev flag.

### P0-2 · `DB_SYNCHRONIZE` defaults to `true` (prod data-loss risk)
```
api/src/config/configuration.ts   synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true'
api/src/database/database.module.ts:103,111   synchronize: db.synchronize   // applied to MySQL too
```
TypeORM `synchronize` auto-alters the live schema on boot — it can drop/rename
columns and destroy data. There are **no migrations**. **Fix:** default to
`false`; generate TypeORM migrations; set `DB_SYNCHRONIZE=false` in prod and run
migrations in the deploy step.

### P0-3 · Insecure default secrets, no fail-fast
```
api/src/config/configuration.ts
  jwt.secret        ?? 'dev-insecure-jwt-secret-change-me'
  jwt.refreshSecret ?? 'dev-insecure-refresh-secret-change-me'
  dataEncryptionKey ?? '0000…0000'  (all-zero 32-byte key)
```
The app boots in production with these if env is unset — forgeable tokens and
worthless encryption. **Fix:** on startup, if `NODE_ENV=production` and any
secret equals its dev default (or is missing), **throw and refuse to boot**.

### P0-4 · Payments are a mock gateway
```
api/src/payments/payments.service.ts:49   // card / airtel → mock authorize (always succeeds)
```
Card and mobile-money charges always "succeed"; no real PSP, no idempotency
keys, no webhook reconciliation, no 3-DS/capture. Fine for demo, unacceptable
for real money. **Fix:** integrate a real PSP (Stripe / Flutterwave / mobile-
money aggregator) behind the existing `PaymentsService` seam; add idempotency +
webhook confirmation before marking orders paid.

---

## 🟠 P1 — High (fix before scale / real traffic)

### P1-1 · No socket access-token refresh → users drop every 15 min
Access TTL is `15m`; the socket carries the access token in the handshake. On
expiry the server rejects it → `unauthorized` → `logout()`
(`realtime-context.tsx`). Reconnection retries with the **same stale token**
(`socket-client.ts`). **Fix:** on `unauthorized`/`connect_error`, call
`/auth/refresh`, then reconnect with the new access token; refresh proactively
before expiry.

### P1-2 · WebSocket layer is unthrottled
`ThrottlerGuard` covers only the auth REST controller. Every read/write flows
through the socket with **no rate limiting** — an authenticated client can flood
any handler. **Fix:** add per-socket/per-event rate limiting in the gateway
(token-bucket keyed by user id).

### P1-3 · WebSocket payloads are unvalidated
Handlers use untyped `@MessageBody()`; the global `ValidationPipe` only acts on
DTO classes with `class-validator` decorators — there are **none** in
`src/realtime/`. Only manual null checks exist; no type/enum/bounds validation.
**Fix:** define DTO classes per event and apply the validation pipe to the
gateway, or validate with a schema (zod) at the top of each handler.

### P1-4 · No automated test suite (0 unit/integration tests)
Only the e2e smoke exists. 105 handlers / business logic (refunds, cancel
restock, payouts, disputes) have no regression net. **Fix:** add unit tests for
services (orders cancel/refund, payments, wallet, payouts) and integration tests
for critical socket flows; wire into CI.

---

## 🟡 P2 — Medium

- **P2-1 · No `helmet`** on REST → missing security headers (HSTS, CSP,
  X-Frame-Options). Add `helmet()` in `main.ts`.
- **P2-2 · No React error boundaries** (`0 app/**/error.tsx`) → a render throw
  white-screens the whole route. Add `error.tsx` per portal segment.
- **P2-3 · No graceful shutdown** — `enableShutdownHooks()` not called; in-flight
  sockets/requests are dropped on deploy. Add shutdown hooks + SIGTERM draining.
- **P2-4 · No structured logging / error monitoring** — `console.log` only; no
  request ids, no Sentry/OTel. Add a logger (pino) + error tracking.
- **P2-5 · SQLite is the default DB** — prod must set `DB_TYPE=mysql` with a
  connection pool; document and enforce.

## 🟢 P3 — Polish

- Hardcoded `api/v1` prefix per controller (use `setGlobalPrefix` + versioning).
- No OpenAPI/Swagger for the REST surface; no documented socket schema contract.
- No request-id / correlation id propagation.
- Remaining ~dozen mock-only frontend write-actions + RMA/exception list pages
  (tracked in `docs/BACKEND-AUDIT.md`) — feature-complete, not launch-blocking.
- Product images reference remote Unsplash URLs (blocked by CSP in some envs);
  move to owned/CDN assets.

---

## Suggested order of work

1. **P0-3** (fail-fast secrets) — 1 file, immediate safety.
2. **P0-2** (synchronize=false + migrations) — prevents data loss.
3. **P0-1** (real login/register wiring) — unlocks real users.
4. **P1-1** (socket token refresh) — sessions survive.
5. **P0-4** (real PSP) — largest external dependency; scope separately.
6. P1-2/P1-3 (WS throttle + validation), P1-4 (tests), then P2/P3.
