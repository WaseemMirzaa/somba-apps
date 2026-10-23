# API security — status and checklist

Snapshot of the security posture of `api/` and the clients, taken from the code on branch
`claude/somba-api-analysis-4rg0y7`. "Verified" means exercised by a test or a live run;
"present" means the code exists but I did not test it.

## 1. What is already in place

| Area | Control | Status |
|------|---------|--------|
| Passwords | bcrypt, cost 12 | present |
| Sessions | JWT access (15 m) + refresh (30 d) with revocation; suspended accounts rejected at login, refresh and socket handshake | verified (`smoke:account`) |
| AuthZ | `JwtAuthGuard` on REST; role checks on every Socket.IO handler; list limits normalised; staff lists closed to customers | verified (`smoke:authz`, 198 checks) |
| Pricing | Order totals computed server-side; client-sent price/discount fields ignored | verified (`smoke:authz`) |
| Data at rest | AES-256-GCM on email, phone, addresses; deterministic hash for email lookup | present |
| Transport headers | Helmet; CORS + WebSocket origin allow-list from `CORS_ORIGINS` | present |
| Abuse | Throttler 30 req/min/IP on REST, `WsThrottleInterceptor` per socket, nginx 10 req/min on `/api/v1/auth/` | present |
| Uploads | JWT required, 5 MB cap, JPEG/PNG/WebP by magic bytes (client MIME ignored), random filename, `nosniff` | verified (`smoke:account`) |
| Payments | Webhook HMAC over raw body (`MM_WEBHOOK_SECRET`); mobile money fails closed (`MM_PROVIDER=none`); sandbox refused in production | present |
| Boot guard | API refuses to start in production with dev-default secrets, all-zero encryption key, SQLite, `DB_SYNCHRONIZE=true`, or sandbox payments | present (`assert-production.ts`, `npm run check:prod`) |

## 2. Gaps found

1. **Dependency advisories** (`npm audit --omit=dev`):
   - `api`: critical `proxy-addr`; high `multer`, `engine.io`, `@nestjs/platform-express`, `brace-expansion`. `multer` handles the upload endpoint.
   - `web`: critical `next`; high `nanoid`, `postcss`, `sharp`, `source-map-js`.
   - Fixes are available (`npm audit fix`); review the resulting diff and re-run the smoke suites before merging.
2. **Tokens in `localStorage`** — `web/src/lib/realtime/auth-api.ts` stores both the access and the refresh token there. Any XSS can read them. Prefer an HttpOnly, Secure, SameSite refresh cookie, with the access token held in memory.
3. **No Content-Security-Policy** on the web app (`next.config.ts`) or the API. Helmet's default CSP is not configured for the Next.js app; add a policy (allow `images.unsplash.com`, the API origin and its WebSocket).
4. **Mobile apps** keep session data with `shared_preferences` (plaintext). Use `flutter_secure_storage` (Keychain / Keystore) for tokens.
5. **Migration vs entity drift** — fixed here for `support_tickets` / `warehouse_batches`; keep running `migration:run` on a scratch MySQL in CI to catch the next one.

## 3. Before going live

- [ ] Generate `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATA_ENCRYPTION_KEY` (`openssl rand -hex 32`); store outside the repo; **back up the encryption key** — losing it makes encrypted data unreadable.
- [ ] `NODE_ENV=production`, `DB_TYPE=mysql`, `DB_SYNCHRONIZE=false`, migrations on boot.
- [ ] `CORS_ORIGINS` set to the real https origins only.
- [ ] TLS terminated at nginx (`docs/DEPLOYMENT.md` §10); HSTS on.
- [ ] Do **not** run the demo `seed`; use `bootstrap:prod`. Change every `Somba@2026` account.
- [ ] Configure a real mobile-money provider and `MM_WEBHOOK_SECRET`; confirm `MM_PROVIDER` is not `sandbox`.
- [ ] Resolve the dependency advisories above.
- [ ] Run `npm run check:prod` and all `smoke:*` suites against the production-like stack.

## 4. Ongoing

- `npm audit` in CI for `api` and `web`; Dependabot or Renovate for both.
- Run the `smoke:authz`, `smoke:account`, `smoke:flows`, `smoke:race` suites on every PR.
- Rotate JWT secrets on a schedule (this signs everyone out); re-encrypting data needs a key-rotation script that does not exist yet.
- Log and alert on repeated 401/403s, webhook signature failures and throttle hits.
