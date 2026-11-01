# Seller platform — contract

Builder: seller platform (team accounts, 2FA, customer ↔ seller chat, storefront, seller account & settings).
Plan: `docs/WAREHOUSE-SELLER-FLOWS-PLAN.md` §2 S16–S20 and §6 answer 14. Migration: `1792980000001-SellerPlatform`.
Everything below is on the one Socket.IO connection (JWT in the handshake) unless it says REST. Replies are
`{ ok: true, data }` or `{ ok: false, error }`.

---

## 0. For other API builders — `sellerContext` (read this first)

A seller-role account is **the store owner or a team member**. Never look up "my seller" with
`sellers.byUser(user.id)` in a seller-scoped handler: it only knows owners and fails closed for staff.
Use the shared helper:

```ts
import { sellerContext } from '../sellers/seller-context';

const ctx = await sellerContext(user, 'orders');                    // needs write access to orders
const ctx = await sellerContext(user, 'finance', { write: false }); // reading is enough
```

`user` is the socket user `{ id, role, name }`. It **throws** an `Error` whose message is safe to show; the
handler's usual `catch (e) { return fail((e as Error).message) }` turns it into `{ ok: false, error }`.

What it returns (`SellerContext`):

| field | meaning |
|---|---|
| `seller` | the `Seller` row of the store the caller works for |
| `member` | `'owner' \| 'manager' \| 'catalog' \| 'orders' \| 'finance' \| 'support'` |
| `isOwner` | `member === 'owner'` |
| `actor` | `{ id, name, role: 'seller' }`: **the store owner's account id** with the caller's own name. Pass this to services that take "the seller as a user" (`payouts.request`, `orders.sellerReady`, `campaigns.create`, `reviews.reply`, `disputes.sellerRespond`…): they key everything by the owner's account |
| `ownerIds` | `[seller.id, seller.userId]`: every id a listing / order line / campaign of the store may carry |
| `user` | the real caller |
| `suspended` | the store is suspended (see below) |
| `permissions` | what the caller's role allows |

Permissions (`SellerPermission`) and who has them:

| permission | owner | manager | catalog | orders | finance | support | used for |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `any` | x | x | x | x | x | x | the store itself (`sellers:mine`, `team:me`, `sellers:plan`) |
| `insight` | x | x |  |  | x |  | dashboards: `sellers:stats`, `analytics:seller`, goals (read) |
| `catalog_read` | x | x | x | x |  | x | products / categories / inventory (read), `campaigns:list`, `coupons:list`, `products:list` |
| `catalog` | x | x | x |  |  |  | products, inventory, campaigns, flash nominations, coupons, bulk import |
| `orders` | x | x |  | x |  |  | orders, returns, disputes, replacements, exchanges, shipping |
| `finance` | x | x |  |  | x |  | payouts, statements, earnings, tax documents |
| `support` | x | x |  |  |  | x | support tickets, product Q&A, review replies, customer chat |
| `storefront` | x | x |  |  |  |  | store profile, vacation, handling time, policies, goals (write) |
| `team` | x |  |  |  |  |  | invite / change role / remove staff |
| `payout_account` | x |  |  |  |  |  | where payouts are sent |
| `account` | x |  |  |  |  |  | plan purchase, KYC resubmission |

Rules `sellerContext` enforces for you, so handlers do not repeat them:

* **Role**: a role without the permission gets `"Your team role (finance) does not allow this. Ask the store owner."`.
* **Suspended store = read-only**: only `{ write: false }` calls on `orders`, `finance`, `insight`, `any` succeed
  (in-flight orders and earnings stay visible). Everything else gets
  `"Your store is suspended: you can only view orders and earnings until it is reinstated."`.
  Pass `{ write: false }` for every handler that only reads, or suspended stores lose their orders list.
* **2FA**: when the admin setting `seller2faRequired` is `true`, a store **owner** without 2FA gets
  `"Two-factor authentication is required for seller accounts. Turn it on in Settings > Security."` on every
  permission except `any`.
* No store → `"Open a store first."`; not a seller-role account → `"Sellers only."`.

Other helpers:

* `SellerContextService.membership(userId)` → `{ seller, member } | null` (no permission check).
* `PlanGateService` (global provider): `await planGate.assert(ctx.seller, 'coupons' | 'flashNomination' | 'bulkImport' | 'promotions')`
  throws `"Your Starter plan does not include seller coupons. Upgrade your plan to use it."`; `allows(seller, key)` →
  boolean; `teamSeats(seller)`. Enforced today: `promotions` in `campaigns:create`, seats in `team:invite`,
  `maxProducts` in `products:create`. **Commerce builder: gate seller coupons, flash-sale nominations and bulk import
  with `planGate.assert`.**
* **Live events and notices reach staff for free.** Anything sent to the owner with `emitter.toUser(ownerUserId, event, …)`
  or `notifications.toUser(ownerUserId, { type, … })` is repeated to the staff whose role handles it. The mapping is by
  event prefix (`order:`, `exchange:`, `replacement:`, `dispute:`, `delivery:` → orders; `product:` → catalog read;
  `campaign:`, `flashsale:`, `stock:` → catalog; `payout:` → finance; `review:`, `question:`, `support:` → support;
  `seller:` → everyone) and, for saved notices, by the notice `type` (`order|delivery|dispute|return|exchange|replacement`
  → orders, `payout|finance` → finance, `moderation|product|stock|campaign|flash|promo` → catalog,
  `review|question|support|chat` → support, everything else → owner + manager; `team` and `security` → owner only).
  Use those `type` values for new notices; do not notify team members yourself. The staff copy of `seller:updated` has the owner's KYC papers,
  payout destination, goals and account id removed (`sellers/staff-view.ts`); if you add an owner-only field to a store payload, add it there.
* **Notification switches**: users can turn push off per kind (`order|payout|stock|review|question|message|product|promo`,
  see §5). Notices keep their `type` so this works; a switched-off kind still lands in the bell.

---

## 1. Team accounts (S20)

Table `seller_team` (`sellerId`, `userId`, `emailHash`, `email` encrypted, `name`, `role`, `status invited|active|removed`,
token hash + expiry, `invitedBy`, `acceptedAt`, `removedAt`). The owner is the store's `userId` and is *listed* by
`team:list` but not stored there. A team member is a normal **seller-role** account (role `seller`); one account works
for one store, and a store owner cannot be staff elsewhere.

Flow: owner `team:invite` → e-mail with `${WEB_URL}/seller/team/accept?token=…` (bilingual) → invitee signs up as a
seller with **the invited e-mail** (`POST /api/v1/auth/register { role: 'seller' }`) or signs in →
`team:accept { token }`. Outside production `team:invite` also returns `devToken` (the same token) so tests need no mailbox.

| event | who | payload → data |
|---|---|---|
| `team:list` | owner (admins `admin`, `admin_operations`, `admin_moderation`, `admin_support` read any store with `{ sellerId }`) | `{}` → `{ seller: {id,name}, seats: {used, max\|null}, members: Member[] }` (first member is the owner row `id:'owner'`) |
| `team:invite` | owner | `{ email, role: manager\|catalog\|orders\|finance\|support, name? }` → `{ member, sent, devToken? }` (re-inviting re-sends) |
| `team:accept` | the invitee | `{ token }` → `{ seller: {id,name,status}, role, permissions }` |
| `team:setRole` | owner | `{ memberId, role }` → `Member` |
| `team:remove` | owner | `{ memberId }` → `{ id, removed: true }` (also cancels an open invitation) |
| `team:leave` | member | `{}` → `{ left: true }` |
| `team:me` | any member | `{}` → `{ seller, role, isOwner, suspended, permissions }` |
| REST `POST /api/v1/team/invite/preview` | public | `{ token }` → `{ storeName, role, email, expired }` (404 for an unknown / used token) |

`Member = { id, userId, email, name, role, status: 'invited'|'active', isOwner, invitedAt, acceptedAt, inviteExpiresAt }`.

Pushes: `team:updated` (full `team:list` data) to the owner; `team:me` `{ seller, role, permissions }` to a member whose role
changed; `team:removed` `{ sellerId }` to a member who was removed (the portal should send them away).
Notices: *Team invitation* (invitee with an account), *Team member joined*, *Team role changed*, *Removed from store team*,
*Team member left*.

`sellers:mine` now works for staff too: the same store object plus `membership: { role, isOwner, permissions }`; for staff the
KYC / owner fields (`legalName, phone, idNumber, rccm, taxNumber, documentUrls, payoutMethod, payoutAccountMasked, userId…`)
are removed.

Client-visible errors: `Enter a valid e-mail address.` · `Choose a role: manager, catalog, orders, finance, support.` ·
`You already own this store.` · `This e-mail belongs to a shopper or staff account. Invite another address, or ask the person to open a separate seller account.` ·
`This person already owns a store. A store owner cannot join another store as staff.` · `This person already works for another store.` ·
`This person is already on your team.` · plan: `Your Free plan allows 1 team member. Upgrade your plan to invite more.` / `…does not include team accounts…` ·
accept: `This invitation is no longer valid.` · `This invitation has expired. Ask the store owner to send a new one.` ·
`This invitation was sent to another e-mail address. Sign in with a***@b.com.` · `Sign in with your seller account to accept this invitation.` ·
`A store owner cannot join another store as staff.` · `You already work for a store. Leave it first to join another one.` ·
`You are sending too many invitations. Try again in an hour.` (20 e-mails per store per hour) · `Team member not found.` · `You do not work for a store.` · `You work for a store as staff. Leave its team before opening your own store.`

Seats per plan: `plan.perks.teamSeats` (staff besides the owner; missing / null = unlimited). Defaults: Free 1, Starter 3, Pro 10, Enterprise unlimited.

---

## 2. Two-factor authentication (TOTP, RFC 6238)

HMAC-SHA1, 30 s steps, 6 digits, ±1 step tolerance, a code works once. Secret encrypted at rest, 10 recovery codes
(`XXXX-XXXX`) stored hashed. Columns on `users`: `twofaSecret`, `twofaEnabled`, `twofaRecovery`, `twofaLastStep`.

| event | payload → data |
|---|---|
| `auth:2fa:status` | `{}` → `{ enabled, pending, recoveryRemaining, required }` (`required`: the platform requires it for this account) |
| `auth:2fa:setup` | `{}` → `{ secret, otpauthUrl, issuer, account }` (render a QR of `otpauthUrl`; nothing is enforced yet) |
| `auth:2fa:enable` | `{ code }` → `{ enabled: true, recoveryCodes: string[] }` (**shown once**) |
| `auth:2fa:disable` | `{ code }` (TOTP or recovery code) → `{ enabled: false }`; refused for a seller owner while `seller2faRequired` is on |
| `auth:2fa:recovery` | `{ code }` → `{ recoveryCodes }` (new set; the old ones stop working) |

Every `user` object (`/auth/me`, login, `ready`, `me:get`) now carries `twofaEnabled`.

Sign-in step-up (REST): `POST /api/v1/auth/login { email, password }` returns **either** the usual
`{ user, accessToken, refreshToken }` **or** `{ needs2fa: true, challenge }` (challenge valid 5 min). Then
`POST /api/v1/auth/login/2fa { challenge, code }` → `{ user, accessToken, refreshToken }`. `code` is the 6-digit code or a
recovery code. The phone-code login (`/auth/phone/login`) steps up the same way. Refresh tokens need no second step.
Five wrong codes lock the account's 2FA attempts for 10 minutes (HTTP 429 `Too many wrong codes. Try again in a few minutes.`).

`seller2faRequired` (admin setting, `true|false`, default off): store owners without 2FA can sign in and use `sellers:mine`, `team:me`, `auth:2fa:*`
but every other seller call returns the "Two-factor authentication is required…" error until they enable it.

Errors: `That code is not right. Check the time on your phone and try again.` · `Two-factor authentication is already on. Turn it off first to set it up again.` ·
`Start the setup first.` · `Two-factor authentication is not on.` · `Two-factor authentication is not on for this account.` ·
`This sign-in expired. Enter your password again.` · `Two-factor authentication is required for seller accounts and cannot be turned off.`
Notices (type `security`): *Two-factor authentication enabled / disabled*.

---

## 3. Customer ↔ seller chat

Tables `conversations` (one per customer + store + context; `contextKey` is `o:<orderId>`, `p:<productId>` or empty; unread
counters per side) and `conversation_messages` (text up to 2000 characters, up to 4 platform photos from `POST /api/v1/uploads`).
The seller side is the owner plus team members whose role is `manager`, `support` or `orders`. A suspended store can read but not reply.
Rate limits: 20 messages / minute / account, 10 new conversations / hour.

| event | payload → data |
|---|---|
| `chat:start` | `{ sellerId, productId?, orderId?, text, attachments? }` → `{ conversation, message }` (reuses the thread for the same context) |
| `chat:list` | `{ as?: 'buyer'\|'seller', limit?, offset? }` → `Conversation[]`, newest activity first |
| `chat:messages` | `{ conversationId, before?: messageId, limit? }` → `{ conversation, messages (oldest first), hasMore }` |
| `chat:send` | `{ conversationId, text, attachments? }` → `{ message }` |
| `chat:markRead` | `{ conversationId }` → `{ conversationId, unread: 0 }` |
| `chat:unread` | `{}` → `{ total, buyer, seller }` |
| `translate:text` | `{ kind: 'chat_message', id: messageId, target: 'en'\|'fr' }` → `{ text, sourceLang, same }`; only the two sides of the conversation |

`Conversation = { id, side ('buyer'|'seller' = the viewer's side), buyerId, buyerName, sellerId, storeName, storeLogo, productId, productName,
productImage, orderId, orderReference, lastMessageAt, lastMessagePreview, unread }`;
`Message = { id, conversationId, senderId, senderSide, senderName, text, attachments[], createdAt }`.

Pushes: `chat:message` `{ conversation, message }` to the customer and to every account on the seller side (each with its own `unread`);
`chat:read` `{ conversationId, side, readBy }` to both sides. A saved notice (type `chat`, push) goes to the receiving side when it had no unread
message before (not for every message): customers get *New message from the seller*, the store *New customer message*.
Contact-information filtering is a no-op hook (`cleanChatText`); the rate limits are the abuse control.

Errors: `Only shoppers can message a store.` · `Store not found.` · `You cannot message your own store.` · `Write a message first.` ·
`A message can have up to 2000 characters.` · `That product does not belong to this store.` · `Order not found.` · `That order has nothing from this store.` ·
`You are opening too many conversations. Try again later.` · `You are sending messages too fast. Wait a moment.` · `Conversation not found.` ·
`Attach up to 4 photos.` · `Attachment must be an image uploaded through the platform.` · `Your store is suspended: you can read messages but not reply.` · `Nothing to translate.`

---

## 4. Storefront (S18)

Columns on `sellers`: `vacationUntil`, `handlingDays`, `returnsPolicy`, `shippingPolicy` (policies are translated by the
translations pipeline, like the store description), `goals`.

`sellers:update` (permission `storefront`: owner, manager) now also takes:

| field | meaning |
|---|---|
| `vacationUntil` | ISO date/time, or a bare `YYYY-MM-DD` (= end of that day); `null` / `''` reopens. Must be in the future and within a year |
| `handlingDays` | whole days 0–14 the store needs to hand a parcel over; **added to every delivery estimate** |
| `returnsPolicy`, `returnsPolicyFr`, `shippingPolicy`, `shippingPolicyFr` | 10–2000 characters in either language; the other is translated; `null` clears |

The reply is the store (`sellers:mine` shape). Served on the store, the storefront (`sellers:storefront`) and `seller:updated`:
`onVacation`, `vacationUntil`, `handlingDays`, `returnsPolicy`, `returnsPolicyFr`, `shippingPolicy`, `shippingPolicyFr`.

Every product object (`products:list/get`, `product:created/updated`…) now carries `sellerOnVacation`, `sellerVacationUntil`,
`sellerHandlingDays`, `totalDeliveryDays` (`deliveryDays + sellerHandlingDays`), `sellerVacationNotice: { en, fr } | null`.
**Hide "Add to cart" when `sellerOnVacation` and show `sellerVacationNotice[locale]`.**
While a store is away: `orders:create` and `cart:set` (for lines the cart did not already hold) refuse its products with the bilingual
error `"<Store> is on vacation until 12 Nov 2026 and is not taking new orders. / <Store> est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes."`;
orders already placed carry on. The order's `estimatedDeliveryDate` uses `deliveryDays + handlingDays`. The store reopens by itself when
the date passes (notice *Vacation mode ended*).

Push: `store:vacation` `{ sellerId, onVacation, vacationUntil, notice? }` to customers, guests and sellers.

Goals (replace the browser-storage copy): `sellers:goals:get` (permission `insight`, read) → `{ revenueUsd, orders, rating, products }` (null = no goal);
`sellers:goals:set` (permission `storefront`) with the same object → the saved goals.

Errors: `Handling time must be a whole number of days from 0 to 14.` · `Enter a valid return date, or clear it to reopen the store.` ·
`Choose a return date in the future. To reopen now, clear the date.` · `A vacation can last at most one year.` · `Returns policy must be 10-2000 characters.` ·
`Revenue goal must be a number from 0 to 1000000000.` (and the same for orders / rating / listings).

---

## 5. Seller account & settings (S16)

* **Notification preferences**: `me:prefs` / `me:setPrefs` work for sellers and staff. `prefs` gains
  `notify: { order, payout, stock, review, question, message, product, promo }` (all `true` by default);
  `me:setPrefs { notify: { order: false } }` merges. A switched-off kind still creates the notice in the bell but sends no push.
  Errors: `notify must be an object of true/false switches.` · `Unknown notification kind: x.`
* **Change password**: `me:changePassword { current, next }` works for owners and staff (returns fresh tokens).
* **Delete account**: `me:delete { password }`. A staff member simply leaves the team. An **owner** is refused while orders are in flight
  (`You still have 2 orders in progress. Finish or cancel them before deleting your account.`), a payout is being processed
  (`A payout is still being processed. Wait until it is paid before deleting your account.`) or earnings are unpaid
  (`You still have $12.50 to withdraw. Request a payout first, then delete your account.`). Otherwise the store is closed
  (status `suspended`, reason *The owner deleted the account.*, listings taken down, staff seats ended) and the account erased. Customers' chats are erased too.
* **Payout account** (new): `sellers:payoutAccount:get` (finance read) → `{ method, account (owner only), masked, set }`;
  `sellers:payoutAccount:set { method: 'bank'|'mobile_money', account }` or `{ clear: true }` (**owner only**).
  `payouts:request`: the owner may still name any destination; staff (`finance`, `manager`) can only pay out to the saved account (or `wallet`):
  `The store owner has not saved a payout account yet.` Admin and public store views never contain the account, only `payoutAccountMasked`.
* **Plan features**: `sellers:plan` (any member) → `{ plan, perks: { promotions, flashNomination, coupons, bulkImport }, maxProducts, teamSeats: { used, max } }`.
  Plans (`sellerPlans` setting) gain `perks: { promotions?, flashNomination?, coupons?, bulkImport? (booleans), teamSeats? (number|null) }`; a missing key = allowed.
* **Private KYC documents**: documents are no longer served from `/uploads/`.
  * Upload: `POST /api/v1/private-uploads` (Bearer, multipart field `file`; JPEG/PNG/WebP/PDF ≤ 5 MB) → `{ id, url, mime, size }`.
  * Put the returned `url` in `documentUrls` of `sellers:register` / `sellers:resubmit`. Old clients may still send a public `/uploads/…` URL: the server **moves the file** behind the login and stores the private URL. Existing stores are migrated at start-up.
  * Download: `GET /api/v1/private-uploads/:id` with `Authorization: Bearer …` (owner, `admin`, `admin_moderation`, `admin_operations` only; anyone else 404). To open a document in a browser tab call `private:link { id }` → `{ url, expiresAt }` (signed, 5 minutes).
  Errors: `No file uploaded (field name "file").` · `Only JPEG, PNG, WebP or PDF files are allowed.` · `The file is too large (5 MB at most).` ·
  `Document is not valid. Upload it again.` (a private file that is not the applicant's own) · `File not found.` (404: missing **or** not yours) ·
  `Sign in to continue.` (401) · `Upload between 1 and 5 identity or business documents.` · `Document is not a valid image.`
* **Reputation**: `rating`, `ratingCount`, `fulfilmentRate`, `badge` are recomputed hourly (`SELLER_SCORE_SWEEP_MS`) from the visible reviews of the store's products and its settled order lines (delivered, or cancelled by the seller). A store with no reviews and no settled lines that was never scored keeps its stored values (a curated demo rating, a badge set by hand); once scored it always follows the data. gold: ≥ 20 reviews, ≥ 4.5, ≥ 95 % fulfilled; silver: ≥ 5 reviews, ≥ 4.0, fulfilment ≥ 90 % when known; else bronze; `somba_assured` is manual and never changed. Admin: `sellers:rescore { sellerId? }`. Notice *Seller badge updated* on a change.
* **Suspended seller**: read-only access to orders and earnings (`orders:list`, `payouts:list`, `payouts:available`, `payouts:statement`, `sellers:stats`, `analytics:seller`, `sellers:mine`); every write fails with the suspended message.

---

## 6. Database & operations

* Migration `1792980000001-SellerPlatform`: tables `seller_team`, `conversations`, `conversation_messages`, `private_files`; columns on `sellers` (`vacationUntil, handlingDays, returnsPolicy, shippingPolicy, goals, ratingCount, fulfilmentRate, scoreUpdatedAt, payoutMethod, payoutAccount`) and `users` (`twofaSecret, twofaEnabled, twofaRecovery, twofaLastStep`).
* Env: `PRIVATE_UPLOAD_DIR` (default `<cwd>/uploads-private`, **must be outside the public uploads folder and persisted**; `deploy/droplet-deploy.sh` creates `/opt/somba/uploads-private` (mode 700) and `deploy/backup.sh` archives it), `SELLER_SCORE_SWEEP_MS` (default 3 600 000; 0 = off), `VACATION_SWEEP_MS` (default 300 000; 0 = off), `WEB_URL` (invitation links).
* New notices (all have French in `notifications/localize.ts`): *Team invitation, Team member joined, Team member left, Team role changed, Removed from store team, New customer message, New message from the seller, Two-factor authentication enabled / disabled, Vacation mode ended, Seller badge updated*.
* Jest: `sellers/*.spec.ts`, `chat/chat.service.spec.ts`, `auth/totp.spec.ts`, `auth/twofa.service.spec.ts`. Smoke: `npm run smoke:sellerplatform` (`test/seller-platform-smoke.cjs`).

---

## 7. Notes for the other builders and the clients

* **Support tickets are per account.** A team member's `support:*` tickets are their own (`user.id`), not the store's; if the store wants shared
  tickets, `support.gateway.ts` should map staff to `ctx.actor` after `sellerContext(user, 'support')`.
* **`products/product-import.service.ts`** still resolves the store with `sellersSvc.byUser(user.id)` and so refuses team members (fail-closed). Switch
  it to `sellerContext(user, 'catalog')` + `planGate.assert(ctx.seller, 'bulkImport')`.
* Anything that resolves a store with `sellers.byUser(userId)` keeps working for **owners only**; that is deliberate (staff fail closed instead of
  inheriting owner rights).
* **Links**: notices of type `chat` open `/shop/messages/<conversationId>` (shopper) and `/seller/messages/<conversationId>` (store); `team` opens
  `/seller/team`; `security` opens `/seller/settings`. Invitation e-mails link to `/seller/team/accept?token=…` on `WEB_URL`.
* **Clients**: after login a client must handle `{ needs2fa: true, challenge }` (any role can turn 2FA on); for a seller account call `sellers:mine` and read
  `membership.role` / `membership.permissions` to hide what the role cannot do, and listen for `team:me` (role changed) and `team:removed`.
* **Staff data hygiene**: staff never receive the owner's KYC (`legalName, phone, idNumber, rccm, taxNumber, documentUrls`), the payout account, or goals
  they have no permission for.
* The socket adapter raises the namespace's and each socket's max-listeners limit to the number of gateways (see "Integration fixes").

## Integration fixes

- **Phone-code sign-in steps up too.** `POST /api/v1/auth/phone/login` for an account with 2FA on answers `{ needs2fa: true, challenge }` (no tokens), exactly like password login; complete it with `POST /api/v1/auth/login/2fa { challenge, code }` (authenticator or recovery code).
- **`store:vacation`** carries `{ sellerId (store id), ownerId, sellerIds: [storeId, ownerId], onVacation, vacationUntil, notice: {en, fr} | null }`; listings may hold either id, so match on `sellerIds`. Storefront payloads (`sellers:storefront`, `sellers:mine`, `seller:updated`) carry `vacationNotice: {en, fr} | null`.
- **Policies.** When the translation job finishes, the owner (and admins, and the team) get `seller:updated` with the translated `returnsPolicyFr` / `shippingPolicyFr` (a second push after the `sellers:update` reply).
- **Delivery total.** `totalDeliveryDays = min(30, deliveryDays + handlingDays)`; the order's `estimatedDeliveryDate` uses the same number. (Replaces "`deliveryDays + sellerHandlingDays`" above.)
- **`products:list`**, **`campaigns:list`**, CSV language, live `campaign:updated` / `coupon:updated`: see `commerce.md` §10.
- **Chat.** Attachments may be png, jpg/jpeg, webp or heic (the uploads endpoint's formats); `chat:start` checks the per-minute send limit **and** the per-hour start limit before it creates the conversation, so a refused first message leaves nothing behind.
- **Sockets.** Each gateway adds one `connection` listener to the namespace and up to two `disconnect` listeners to every client socket (Nest's hook and the adapter's message stream); the adapter raises the namespace's max-listeners to the number of gateways (16) and each socket's to twice that (32), instead of an arbitrary 64 on the wrong emitter. No more `MaxListenersExceededWarning`.
