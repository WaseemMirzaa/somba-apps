# Commerce contract (finance, inventory, promotions, products, seller orders)

Owner: the commerce builder. Migration `api/src/database/migrations/1792970000001-Commerce.ts`.
Everything below is a Socket.IO event on the one shared socket (JWT in the handshake, ack envelope
`{ ok: true, data } | { ok: false, error }`). New handlers live in `finance/finance.gateway.ts`,
`inventory/inventory.gateway.ts` and `products/commerce.gateway.ts`; the changed older handlers stay in
`realtime.gateway.ts`. Money is USD; dates are ISO strings; months are `YYYY-MM` in UTC.

Roles: **seller** = the store owner **or a team member** (resolved with `sellerContext`, see `docs/contracts/seller-platform.md` §0;
a role without the permission gets *Your team role (X) does not allow this. Ask the store owner.*): stock, coupons, flash nominations,
campaign submit and bulk import need `catalog` (reading: `catalog_read`), seller orders need `orders`, finance needs `finance`.
A suspended store keeps only the read-only calls (`orders:sellerList`, `finance:*`). **content** = `admin`, `admin_marketing`.
**finance** = `admin`, `admin_finance`. Admins pass `sellerId` (the **store id**, `sellers.id`) where noted.
**Plan gate**: `coupons:create` needs the plan perk `coupons` (*Your Free plan does not include seller coupons. Upgrade your plan to use it.*),
`flashsales:nominate` needs `flashNomination`, `products:import` needs `bulkImport` (sellers only; admins are not gated).
**Rate limit**: the handlers in these three gateways allow 40 events per second per socket (`Too many requests — slow down.`); `campaigns:track` has its own, tighter limits.

---------------------------------------------------------------------------------------------------

## 1. Finance (seller)

### `finance:settings` — seller, finance
`-> { currency: 'USD', commissionPct, minPayoutUsd, payoutClearanceHours }`
The rules the seller's money follows. `commissionPct` is the rate for NEW orders (past lines keep their own).

### `payouts:available` (existing, extended) — seller
`-> { earned, committed, available, owedUsd, commissionPct, commissionUsd, minPayoutUsd, holdHours, clearingUsd, nextClearanceAt, inProgressUsd }`
* `available` = what can be withdrawn now: delivered lines that have **cleared the hold** (`holdHours` after delivery),
  net of commission and store coupons, minus payouts already requested / sent / paid.
* `clearingUsd` = delivered but still inside the hold; `nextClearanceAt` = when the next such line clears (null if none).
* `inProgressUsd` = net of orders still on their way. Neither is withdrawable.

### `finance:earnings` — seller, finance
Body `{ sellerId?, limit?(<=200, default 50), offset?, from?, to?, state?, q? }` — `from`/`to` filter the **order date**
(ISO or `YYYY-MM-DD`, `to` inclusive); `state` one of the states below; `q` matches order reference or product name.
```
-> { limit, offset, total, holdHours,
     items: [{ itemId, orderId, orderReference, orderStatus, orderedAt, deliveredAt, productName, variant, qty,
               grossUsd,            // price x qty less this line's share of a store coupon
               couponUsd, commissionPct, commissionUsd, netUsd,
               state, clearanceEndsAt,   // clearanceEndsAt: delivered lines only
               payout: { id, reference, status } | null, paidOutAt }],
     totals: { inProgressUsd, clearingUsd, availableUsd, inPayoutUsd, paidOutUsd, returnedUsd },   // all states, same date range + q
     balance: <payouts:available> }
```
`state`:
| state | meaning |
|---|---|
| `in_progress` | the parcel is still on its way (not earned) |
| `clearing` | delivered, inside the hold; withdrawable at `clearanceEndsAt` |
| `available` | delivered, cleared, on no payout yet |
| `in_payout` | on the statement of a payout that is `requested` / `sending` |
| `paid_out` | on the statement of a **paid** payout (`paidOutAt` set when the payout is paid) |
| `returned` | the order was returned: the sale is taken back |

Cancelled orders / lines never appear. A payout statement locks **all** eligible lines when it is requested, so after a
partial payout the lines read `in_payout` / `paid_out` while the unpaid remainder is still in `balance.available` —
`balance` is the authority for money, the line states for "where is this sale".

### `finance:statements` — seller, finance
* `{ sellerId? }` (no `month`) `-> { currency, months: [{ month, orders, units, grossUsd, commissionUsd, refundsUsd, commissionCreditedUsd, netUsd }] }` (last 12 months, newest first)
* `{ month: '2026-10' }` `-> { currency, month, store, totals: { orders, units, grossUsd, commissionUsd, refundsUsd, commissionCreditedUsd, netUsd, payoutsRequestedUsd, payoutsPaidUsd }, lines: [{ kind: 'sale'|'refund', date, orderReference, productName, variant, qty, grossUsd, commissionPct, commissionUsd, netUsd }], payouts: [{ id, reference, amountUsd, method, status, createdAt }] }`
  A sale is dated when its order was delivered; a sale taken back by a return is a negative `refund` line dated when it was returned.
* `{ month, format: 'csv' } -> { filename: 'statement-2026-10.csv', csv }` (UTF-8 with BOM, CRLF).

### `finance:transactions` — seller, finance
Body `{ sellerId?, limit?(<=200, default 50), offset?, from?, to?, format?: 'csv' }`
`-> { total, limit, offset, totals: { salesUsd, refundsUsd, payoutsUsd, netUsd }, items: [{ id, at, kind: 'sale'|'refund'|'payout', reference, description, grossUsd, commissionUsd, amountUsd, status, counts }] }`
Newest first. `amountUsd` is signed (sale +net, refund -net, payout -amount; a rejected payout is `0`, `counts: false`).
With `format: 'csv'` `-> { filename: 'transactions.csv', csv }` (all matching rows, max 20 000).

### `finance:taxDocuments` — seller, finance
Body `{ sellerId?, year? }`
`-> { items: [TaxDocument], months: [{ month, orders, commissionUsd, hasSales, documentId, url }] }` (last 12 months; `url` null until issued)

### `finance:taxDocument` — seller, finance
Body `{ period: '2026-10', locale?: 'en'|'fr', sellerId?, refresh? }` `-> TaxDocument`
```
TaxDocument = { id, sellerId (user id), period, number: 'CI-202610-4F3A2B1C', locale, orders, units, grossUsd,
                commissionUsd, creditedUsd, netUsd, url, createdAt, updatedAt }
```
`url` is a PDF under `/uploads/invoices/<sellerUserId>/…` (absolute, built from the socket's host or `PUBLIC_API_URL`), in the
seller's language (`locale` overrides). A month that has ended is **frozen** once issued (same document comes back; only
an admin can `refresh`); the current month is rebuilt on every call with the same number. First issue of a closed month
notifies the seller (`type: 'finance'`).

### Admin finance refresh
* `analytics:finance` now also returns `version` (12-char fingerprint of orders/payments/payouts) and `updatedAt` (latest change).
* `finance:version` (finance) `-> { version, updatedAt }` — the same two fields, three tiny queries.
* Event **`finance:changed { version, updatedAt }`** to rooms `admin`, `admin_finance`, debounced (750 ms), after any order, payment or payout is saved. Refresh `analytics:finance` when `version` differs from the one on screen.

### Payout notices
Requests, paid (manual, wallet and pawaPay), rejected and failed pawaPay transfers now also notify role `admin` (super admin):
titles `Payout requested`, `Payout settled`, `Payout declined`, `pawaPay payout failed`.

---------------------------------------------------------------------------------------------------

## 2. Inventory

### Model
* `products.stock` = units on hand in total. `products.variantStock` = `{ "Size: 42 · Colour: Black": 5, … } | null`, units set aside per
  option label (the canonical label used by carts and orders). An option **without** an entry draws on the shared pool
  `stock - sum(variantStock)`. `variantStock: null` = stock is not split (everything is the pool).
* Reserving / restocking an option with an entry moves both the entry and the total; without one, only the total.
  Both are atomic (conditional UPDATE; products with a split are compare-and-swapped on `(stock, variantStock)` and retried).
* Setting `variantStock` through `products:create/update` makes `stock = sum(entries) + pool` (pool kept), or the `stock` you send
  (must be >= the sum). Changing the options prunes entries of options that no longer exist.

### `inventory:adjust` — seller (own products), admin
Body `{ productId, variant?, delta, reason?, note? }` — `delta` is a whole non-zero number of units to **add or remove** (never an absolute value).
`reason` ∈ `manual_adjust` (default) | `replacement` | `return_restock`. `variant` = a real option label (any case); omit for the product / pool.
`-> { productId, stock, variantStock, variant, delta, reason, stockAfter }`. Emits `product:updated`.

### `inventory:movements` — seller (own), admin
Body `{ productId, limit?(<=200, default 50), offset? }` `-> { productId, total, limit, offset, items: [{ id, productId, variant, delta, stockAfter, reason, orderId, actorId, note, createdAt }] }`
Newest first. `reason`: `sale` | `cancel_restock` | `return_restock` | `manual_adjust` | `replacement` | `import` | `initial`.
Written by `ProductsService.reserve / restock / adjustStock` (every stock change), by product creation (`initial`, or `import`) and by an
absolute edit in the product form (`manual_adjust`, note "Edited in the product form").

### `inventory:settings` — seller (admin with `sellerId`)
No body (or `{}`) reads; `{ lowStockThreshold }` (0..100 000) sets. `-> { lowStockThreshold }` (default 10). `sellers.lowStockThreshold` is also on the seller object.

### `inventory:overview` — seller (admin with `sellerId`)
Body `{ q?, low?: true, limit?, offset? }`
`-> { lowStockThreshold, total, limit, offset, summary: { products, units, outOfStock, lowStock }, items: [{ productId, name, sku, image, status, stock, variantStock, pool, reserved, low, outOfStock }] }`
`reserved` = units in open orders (pending → out for delivery).

### `cart:validate` — customer
Body `{ lines?: [{ productId, variant?, qty }] }` (the saved cart when omitted) `-> { ok, lines: [{ productId, variant, requested, available, ok, reason? }] }`.
Same limits as `orders:create`; two lines of the same option are summed.

### Low-stock notices (once per crossing)
After any decrease: seller notice `Low stock` when the product (or the option, if it has its own entry) goes from above the line to at/below it;
`Out of stock` when it reaches 0; `Low stock alert` to roles `admin` and `admin_operations`. Event **`stock:low { productId, variant, stock, threshold, outOfStock }`** to the seller (team members with catalog access hear it too; `+ sellerId` to those roles). Restocking above the line re-arms it.
The admin dashboard alert `low_stock` now counts products at/below **their store's** line.

### Rules for other builders
* **Always pass the line's option and the reason when moving stock**: `products.restock(productId, qty, { variant: item.variant, orderId, reason: 'return_restock' | 'cancel_restock' | 'replacement' })` and `products.reserve(productId, qty, { variant, orderId })`. Without `variant` only the total moves and an option's own count drifts.
* `orders.create` rejects with `Only N of "X" (Size: 42 · Colour: Black) left in stock.` / `"X" (…) is out of stock.` (option-specific) — product without options keeps the old wording.

---------------------------------------------------------------------------------------------------

## 3. Promotions

### Campaign state machine
`draft → pending → scheduled | active → ended`, and `pending → rejected → pending`. `ended` is final.
Approving (`campaigns:setStatus` with `scheduled` **or** `active`) picks `scheduled` while the start date is in the future, else `active`.
A background sweep (every 30 s, `CAMPAIGN_SWEEP_MS`) flips `scheduled → active` at the start date, ends campaigns at the end date (`endedReason: 'dates'`),
and re-announces the effective price of **every** covered product (`product:updated`, sent in pages of 200, no 100 cap).

* `campaigns:create` body gains `draft: true` (saved as `draft`, marketing not notified).
* **`campaigns:submit { id }`** — seller sends a `draft` / `rejected` campaign to marketing (`-> campaign`).
* `campaigns:setStatus { id, status, reason? }` — admins. `rejected` **requires** `reason` (>= 3 chars, stored in `rejectReason`, sent in the notice). Illegal moves fail: `A campaign that is ended cannot become active.`
* Campaign object gains `spentUsd`, `budgetRemainingUsd` (null = no budget), `rejectReason`, `endedReason` (`dates|budget|withdrawn|admin`).
* **Budget**: `budgetUsd > 0` caps the discount given. Each order with the campaign price adds `(list - price) x qty` to `spentUsd`; once `spentUsd >= budgetUsd` the campaign stops discounting at once, is ended (`endedReason: 'budget'`), covered products re-price live, the seller gets `Campaign budget used`. The order that crosses the budget is honoured in full (overshoot <= one order).
* Every sale emits `campaign:updated` (admins + owner) with the new `orders / revenueUsd / spentUsd`.

### `campaigns:track` — shopper (customer or guest)
Body `{ campaignId, kind: 'view' | 'click' }` `-> { counted }`. Counts `campaigns.views` / `clicks` only while the campaign is really discounting;
rate-limited per shopper (60 events/minute; the same event on the same campaign once per 10 s; guests by socket). Staff browsing the shop are ignored (`counted: false`).
Call `view` when a promoted product card/page is shown, `click` when the shopper opens it.

### Flash sales
Object: `{ id, title, titleFr, productId, productName, productNameFr, flashPrice, basePrice, discount, startsAt, endsAt, active, status: 'nominated'|'approved'|'declined', rejectReason, sellerId, sellerName, phase: 'scheduled'|'running'|'ended', ended, startsInMs, endsInMs, createdAt, … }`. `endsInMs` is null both for "no end date" and for "already over": use `endsAt` (null = no end date, never `''`) and `ended` (true once the end passed, or the sale was declined / never approved) to tell them apart. A sale ends **at** `endsAt` (not one millisecond after). `discount` is derived from the prices (`round((base - flash) / base * 100)`, max 90) when the caller sends none, and re-derived when an edit changes `flashPrice` without a `discount`.
* `flashsales:list` (public) now returns **running** sales only (so the deals page can show a countdown with `endsInMs`); `{ upcoming: true }` adds scheduled ones (`phase: 'scheduled'`, `startsInMs`); `{ all: true }` (content) returns everything incl. nominations.
* Events `flashsale:updated` (shoppers, guests, admins; the owning seller too) and `flashsale:removed { id, productId }`; every create / end / edit / delete / start / end also emits `product:updated` for the product (shoppers' price flips live). A sweep (every 30 s, `FLASH_SWEEP_MS`) announces a sale that just started or ended.
* `flashsales:create` (content, existing) — now created `approved`; the owning seller is notified (`Flash sale started` / `Flash sale scheduled`).
* `flashsales:end { id }` (content, existing) — also notifies the seller (`Flash sale ended`).
* **`flashsales:update { id, patch }`** (content) — `flashPrice, discount, startsAt, endsAt, active, title, titleFr`.
* **`flashsales:delete { id }`** (content).
* **`flashsales:nominate { productId, flashPrice, endsAt, startsAt?, title?, titleFr?, discount? }`** (approved seller, own live product) -> sale with `status: 'nominated'`, `active: false` (changes no price). Notifies `admin_marketing` (`Flash sale nominated`).
* **`flashsales:approve { id }`** / **`flashsales:decline { id, reason }`** (content) — approve turns it on (its dates decide when prices change), decline stores `rejectReason`. Seller notices `Flash sale approved` / `Flash sale declined`.
* **`flashsales:mine`** (seller) -> sales on the store's products plus the store's own nominations.

### Store coupons (`coupons:*`)
Stored in `promos` with `sellerId` set. One code field at checkout: `orders:create { promoCode }` accepts a platform code **or** a store coupon (looked up in the same table, codes are globally unique). A store coupon discounts **only that store's lines**, its `minOrder` is measured on them, and the **store pays**: each line carries `couponDiscountUsd`, the commission is charged on the line after the coupon, and earnings drop accordingly. `order.discountUsd` is the coupon total.
* `coupons:list { sellerId? }` — seller (own) / content (all stores; `sellerId` narrows) `-> [Promo & { uses }]`
* `coupons:store { sellerId }` — `sellerId` is the store id **or** the owner's user id (listings may carry either); **public**: the store's active, public, unexpired coupons `[{ code, type, value, minOrder, description, sellerId }]`
* `coupons:create { code, type: 'percent'|'fixed', value, minOrder?, maxUses?, perUserLimit?, expiresAt?, isPublic?, description? }` — approved seller; max 50 per store; percent 1–90, fixed <= 500
* `coupons:update { id, patch }` (`value, minOrder, description, maxUses, perUserLimit, expiresAt, isPublic, active`), `coupons:setActive { id, active }`, `coupons:delete { id }` (an unused coupon is deleted; a used one is switched off: `{ id, deleted: false, coupon }`)
* Events `coupon:updated`, `coupon:removed` (owner + admins).
* `promos:validate { code, subtotalUsd, items?: [{ productId, qty }] }` — send `items` so a store coupon can be previewed (the server prices them). A store coupon without `items` answers `This coupon applies to one store’s products: add them to your cart first.`
* `promos:list` (platform codes) never includes store coupons.

---------------------------------------------------------------------------------------------------

## 4. Products

New/changed fields on `products:create` / `products:update` and on every served product:
`images: string[]` (cover first; `image` is always `images[0]`), `sku`, `brand`, `weightGrams`, `variantStock`.
Inputs also accept `weightKg`. `image` alone still works (it sets the cover; the rest of the gallery is kept).
* `images`: max 8, each an upload of ours (`/uploads/<uuid>.png|jpg|webp`) or an `https://` URL on a public host (no credentials, no private/loopback hosts). Otherwise `Picture 2 must be an upload or a secure (https) link.`
* `sku`: letters, digits and `. _ - / #` (spaces inside ok), <= 60; **unique per seller** (case-insensitive): `The SKU "X" is already used by another of your products.` Enforced in the service and by the unique index `UQ_products_seller_sku`.
* A change to the gallery or brand of a live product sends it back to moderation like a text change.

### `products:import` — seller (admin with `sellerId` = store id)
Body `{ rows?: object[] | csv?: string | csvUrl?: string, dryRun?: boolean }` — at most 500 rows. `csv` text sent over the socket is limited to 900 KB (Socket.IO's message limit is 1 MB):
for a bigger file give a `csvUrl` (up to 2 MB). `csvUrl`: https only, public host, no redirects, 10 s. CSV delimiter `,` `;` or tab, UTF-8 (BOM ok). Header names are matched ignoring case/accents/spaces, English or French:
`name, nameFr, description, descriptionFr, price, originalPrice, category (or categoryId), stock, sku, brand, weightKg|weightGrams, images (urls separated by |) or image, deliveryDays, variants`.
`variants` = `Size=S|M|L;Colour=Black|White`.
```
-> { total, created, failed, dryRun,
     errors:   [{ row, name, sku, errors: [string] }],      // row = line number in the file (header = 1)
     products: [{ row, name, sku, productId? }] }           // imported (or, on dryRun, importable) rows
```
Each valid row is created through the same path as `products:create` (so the other language is translated by the existing pipeline) as a **pending** product awaiting moderation; a bad row never blocks the good ones. Admins get one `Product awaiting review` notice per import.
`products:importTemplate` -> `{ filename, csv, columns }`.

---------------------------------------------------------------------------------------------------

## 5. Seller orders

### `orders:sellerList` — seller
Body `{ limit?(<=200, default 50), offset?, q?, status?, from?, to?, format?: 'csv' }`
`-> { items: SellerOrder[], total, limit, offset }` or, with `format: 'csv'`, `{ filename: 'orders.csv', total, csv }` (up to 5 000 orders).
* `q`: order reference, product name, or the customer's **first name** (one-word search only, prefix).
* `status`: an order status, or a package step `to_pack` | `ready` | `at_hub` (orders where ANY of the seller's lines is at that step).
* `orders:list` (existing, array) now takes the same `q / status / from / to / limit / offset` for sellers (default limit 200, max 1000); with `format: 'csv'` it answers the same `{ filename, total, csv }`.

`SellerOrder` (also pushed on `order:created` / `order:updated`) gains:
```
city: string | null            // the delivery city only; never the street, number or contact
tracking: null | {
  carrier: 'Somba&Teka', currentLeg: kind | null, riderFirstName: string | null, lastUpdateAt,
  legs: [{ id, kind, status, riderFirstName, readyAt, receivedAt, pickedUpAt, deliveredAt, createdAt, updatedAt, attempts, failureReason }] }
```
Built read-only from `delivery_tasks` (`kind`, `sellerId`, status, rider, timestamps); other sellers' pickup legs are hidden. Each line also carries `couponDiscountUsd`, `commissionPct`, `commissionUsd`.

---------------------------------------------------------------------------------------------------

## 6. Notices added (French in `notifications/localize-commerce.ts`, guarded by `notice-coverage.spec.ts`)
`Low stock`, `Out of stock`, `Low stock alert`, `Flash sale started|scheduled|ended|nominated|approved|declined`, `Campaign rejected` (with reason), `Campaign budget used`,
`Commission invoice ready`, `Payout settled`, `Payout declined`; types used: `stock` (stock notices), `flash` (flash sales), `finance` (invoice), `payout`, `campaign`, `moderation`; links in `notifications/links.ts`.

## 7. Client-visible error messages (new)
Inventory: `Enter a whole number of units to add or remove (not zero).` · `Reason must be one of: manual_adjust, replacement, return_restock.` · `This product has no options.` · `There are only N in stock for "Size: 42": you cannot remove M.` · `The low-stock alert must be a whole number from 0 to 100,000.` · `Stock for "X" must be a whole number from 0 to 1,000,000.` · `Total stock (N) is below the stock set per option (M).` · `Add product options (size, colour…) before setting stock per option.`
Products: `Picture N must be an upload or a secure (https) link.` · `At most 8 pictures per product.` · `The SKU "X" is already used by another of your products.` · `SKU can use letters, numbers and . _ - / # (up to 60 characters).` · import: `Import at most 500 products at a time.` · `The file needs a "name" column.` · `The file needs a "price" column.` · `The file is too large (2 MB at most).` · `The file is too large to send here (900 KB at most): split it, or give a link to it.` · `The file link must be a secure (https) address.` · `Your <plan> plan allows N listings: upgrade it to add more.` · `The SKU "X" appears twice in this file.`
Promotions: `Give the seller a reason for rejecting this campaign (at least 3 characters).` · `A campaign that is X cannot become Y.` · `The end date of this campaign has already passed: ask the seller to change the dates.` · `Only a draft or a rejected campaign can be sent to marketing.` · `Kind must be "view" or "click".` · `The flash price must be below the normal price ($N).` · `The end of a flash sale must be after its start.` · `You can only propose a flash sale on your own products.` · `You already proposed a flash sale for this product: wait for marketing to answer.` · `Give the date the flash sale ends.` · `This flash sale is not waiting for a decision.` · `Give the seller a reason for declining (at least 3 characters).` · `A store can hold 50 coupons: delete one you no longer use.` · `This coupon only applies to products from <store>.` · `Your store must be approved before you can issue coupons.` · `The expiry date must be in the future.`
Finance: `Choose a month like 2026-10.` · `State must be one of: in_progress, clearing, available, in_payout, paid_out, returned.` · `There were no sales in YYYY-MM: nothing to invoice.` · `That month has not started yet.` · `Choose a store (sellerId).`
Orders: `Status must be one of: pending, … , to_pack, ready, at_hub.`

## 8. Env / ops
`WS_RATE_MAX` / `WS_RATE_WINDOW_MS` (per-socket limit, default 40 / 1000 ms) · `CAMPAIGN_SWEEP_MS` (default 30000, 0 = off) · `FLASH_SWEEP_MS` (default 30000, 0 = off) · `FINANCE_CHANGED_DEBOUNCE_MS` (default 750) · `PUBLIC_API_URL` (used for invoice links when set).
Smoke: `npm run smoke:commerce` (`api/test/commerce-smoke.cjs`).

## 9. Notes for the other builders and for the web / app builders
* **Served product** gains `images[]` (never empty when there is a cover: a legacy cover is served as a gallery of one), `sku`, `brand`, `weightGrams`, `variantStock`. Seller/admin list rows, `product:created/updated`, the cart, wishlist and campaign payloads all carry them (one composer: `ProductsService.present`).
* **Stock moves only through `ProductsService`**: `reserve / restock / adjustStock` (each writes the ledger and emits `product:updated`). `payments.closeRefundedOrder`, `disputes` (return grading) and `exchanges / replacements` already pass the option and reason.
* **A removed product frees its SKU.**
* **Order lines** (`order_items`) gain `couponDiscountUsd`; seller earnings = `priceUsd x qty - couponDiscountUsd - commissionUsd`. Analytics that sum `priceUsd x qty` (seller revenue) do not subtract store coupons yet.
* **Flash-sale notices to the store** use `type: 'flash'`; stock notices `type: 'stock'`; invoices `type: 'finance'`. These map to the `catalog` / `finance` team permissions, so staff hear what their role handles.
* **Server clocks**: monthly figures are UTC; a month on the Kinshasa wall clock (UTC+1) differs by an hour at the edges.
* Delivery `kind`, `sellerId` and the timestamps read for tracking are the logistics builder's (`delivery_tasks`); a task that predates legs reads as `delivery`.

## 10. Integration fixes

- **`products:list` for a seller** returns only THEIR store's listings (drafts / pending included, `removed` excluded; the optional `status` filter narrows it; team members get the store's through `catalog_read`). Customers and guests still get every live listing.
- **CSV language.** Server-built CSVs (`orders:sellerList` / `orders:list` with `format:'csv'`, `finance:statements`, `finance:transactions`) use the caller's saved language (the REAL caller, a team member keeps their own),
  or `locale: 'en'|'fr'` in the request. French files translate the headings and the status / kind words (order status, package step, payout status, `sale`/`refund`/`payout`, cash on delivery, card, wallet); names, references and amounts are unchanged. English files are exactly as before.
- **Live counters.** `campaigns:track` (counted view / click) pushes `campaign:updated` to the owning seller (throttle: one push per `CAMPAIGN_STATS_PUSH_MS`, default 3000; 0 = at once). Placing or cancelling an order that carries a store coupon pushes `coupon:updated` (with the new `uses`) to the owner (throttle `COUPON_USAGE_PUSH_MS`, default 2000). Admins are not pushed per view.
- **`finance:statements {month}`**: `payoutsRequestedUsd` excludes rejected payouts (they stay in `payouts[]` with `status: 'rejected'`).
- **`campaigns:list`** needs only `catalog_read` (creating / editing / submitting still need `catalog`).
- **`promos:validate`** for a store coupon also returns `sellerName` (the store's name) next to `sellerId`.
- **Import.** A bad row reports every problem it has (`errors[].errors` lists title, price, category, SKU, image, options… all at once).
- **Flash discount** is computed when missing (see §4); flash notices open `/seller/flash-sales`.
