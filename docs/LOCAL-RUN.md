# Running everything locally and testing it

Everything below was run in the build sandbox (Linux, Node 22, MariaDB 11 as the MySQL stand-in, Chromium for browser tests). Real mobile-money, SMS, email and Firebase accounts and a physical phone were not available.

## 1. Start the API

```bash
cd api && npm ci && npm run build
# SQLite (fastest):
NODE_ENV=development DB_TYPE=sqlite DB_SYNCHRONIZE=true npm run seed      # demo data, logins below
NODE_ENV=development DB_TYPE=sqlite DB_SYNCHRONIZE=true MM_PROVIDER=sandbox node dist/main.js   # http://localhost:3001

# MySQL (what production uses): schema comes from migrations only
export DB_TYPE=mysql DB_HOST=127.0.0.1 DB_USERNAME=somba DB_PASSWORD=… DB_DATABASE=somba DB_SYNCHRONIZE=false
npm run migration:run && npm run seed        # or `npm run bootstrap:prod` for a production-safe start
node dist/main.js
```

Seed logins (password `Somba@2026`, development only): `customer@`, `seller@`, `admin@`, `ops@`, `finance@`, `warehouse@`, `rider@` + `somba.app`.

Payment providers: `MM_PROVIDER=sandbox` (development: payments stay pending until confirmed), `MM_PROVIDER=manual` (finance confirms in the admin portal; allowed in production), unset in production = mobile money refused.

## 2. API test suites (against a running, seeded server)

| Command | What it proves | Checks |
|---|---|---|
| `npm test` | Unit tests (incl. pricing rules, analytics helpers, paging, seller plans) | 78 |
| `npm run smoke` | Main commerce flow over the socket | 33 |
| `npm run smoke:account` | Sign-up, verification, reset, uploads, suspension, deletion, promos, reviews | 123 |
| `npm run smoke:authz` | Role boundaries, ownership, mass assignment (incl. analytics, plans, reviews, hubs, campaigns, verification policy) | 198 |
| `npm run smoke:flows` | The fixed flows: failed delivery, pickup / ready / receive, moderation, flash price, handover code, returns before refunds, manual payment, staff accounts, campaign discounts, review replies + moderation, verification policy, seller subscription | 185 |
| `npm run smoke:coverage` | Every other event: catalogue admin, CMS, fraud, questions, warehouse reads and writes, exchanges, real analytics (admin / finance / warehouse / seller), hub directory, list paging | 223 |
| `npm run smoke:race` | Concurrency: last unit of stock, double cancel / refund / payout / confirmation, two riders on one task, wallet double-spend | 24 |
| `npm run check:prod` | Production-mode defaults (incl. verification policy) and manual payment (run against `NODE_ENV=production`) | 17 |

All of them pass on MySQL (migrations only; run them one after another with a pause — login, register and the phone-code endpoints are throttled to 30 requests a minute per IP, so back-to-back suites can hit a 429; token refresh has its own 300-a-minute limit). On SQLite they pass too, except that the race suite is flaky there: in one run the 4-simultaneous-payout-approvals check failed with a SQLite "cannot start a transaction within a transaction" error, and it passed 24/24 on the rerun. SQLite cannot run concurrent transactions, so treat the race suite as meaningful on MySQL only.

## 3. Web app

```bash
cd web
printf 'NEXT_PUBLIC_API_URL=http://localhost:3001\nNEXT_PUBLIC_SOCKET_URL=http://localhost:3001\nNEXT_PUBLIC_DEMO_MODE=false\n' > .env.local
npm ci && npx next build && npx next start -p 3000
```

Sign in at `/login` with the seed accounts. With `NEXT_PUBLIC_DEMO_MODE=false` the one-click demo role picker is hidden.

Browser checks that were run with Chromium (all passing): customer cart → saved address → mobile-money checkout → pending screen → finance confirms → live confirmation → cancel; seller order page → "package ready"; warehouse inbound → receive; rider accepts → picked up → on the way → wrong code refused → right code delivers; rider reports a failed attempt (re-queued); admin approves a payout with a transfer reference, approves a product, saves a setting; customer return wizard → warehouse marks received → admin resolves; seller 4-step product wizard with a real photo upload.

## 4. Flutter apps

```bash
cd mobile     && flutter analyze && flutter test && flutter test test/live_api_test.dart --dart-define=LIVE_TEST=true --dart-define=API_URL=http://localhost:3001 --dart-define=SOCKET_URL=http://localhost:3001
cd rider-app  && flutter analyze && flutter test && flutter test test/live_api_test.dart --dart-define=LIVE_TEST=true --dart-define=API_URL=http://localhost:3001 --dart-define=SOCKET_URL=http://localhost:3001
```

Results: customer app 55 widget/unit tests + 19 live tests, rider app 29 widget/unit tests + 3 live tests (the live ones need the seeded API above); both `flutter analyze` clean, and both `flutter build web` succeed. Not run on a device or emulator (no Android SDK in the sandbox).

Both apps are bilingual (French is the default for the customer app; the rider app follows the phone's language, `fr` → French, anything else → English): the texts live in `lib/l10n/messages.dart` (key → English, French), see the READMEs. Push notifications and the rider's background location are described in [MOBILE-PUSH.md](MOBILE-PUSH.md) and `rider-app/README.md`; neither could be exercised on a phone.
