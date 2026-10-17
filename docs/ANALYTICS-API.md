# Analytics and related server APIs

Everything here is a Socket.IO request/ack event (`socket.emit(event, body, ack)`; ack is `{ok:true,data}` or `{ok:false,error}`), like the rest of the API. Existing event names and response fields are unchanged; everything new is **additive**. All money is USD. All "day" buckets are **UTC days** `YYYY-MM-DD`, oldest first, zero-filled (a day without data is present with zeros).

Nothing in this document is demo data: every figure is computed from grouped SQL over real orders, payments, deliveries, payouts, reviews and product views. Where the platform does not record something, the field is absent or `null` (never invented):

* Mobile-money **fees** are not tracked, so there is no fee figure.
* Parcels are not tied to a hub, so per-hub numbers are dispatch **batches**, and per-area numbers are by delivery **zone**.
* Product views are counted from the day this shipped (`product_views`); older traffic is unknown.

Roles are the user roles from the JWT (`admin`, `admin_operations`, `admin_finance`, `admin_support`, `admin_marketing`, `admin_moderation`, `warehouse_staff`, `rider`, `seller`, `customer`, `guest`). A denied call returns `{ok:false,error:'Not allowed.'}` (or `'Staff only.'` etc.).

Role groups used below:

| Group | Roles |
|---|---|
| insight | `admin`, `admin_operations`, `admin_finance` |
| finance | `admin`, `admin_finance` |
| moderate | `admin`, `admin_operations`, `admin_moderation` |
| hubs | `admin`, `admin_operations` |
| config | `admin`, `admin_finance`, `admin_operations` |

---

## 1. `analytics:revenue`

Request `{ days?: number }`: integer 1..90, default **7** (larger values are clamped to 90).
Roles: insight.

Response: `Array<{ date: 'YYYY-MM-DD', revenue: number, orders: number }>`, `days` rows, last row = today (UTC).

* `revenue` = sum of **succeeded order payments** created that day (top-ups and plan payments excluded; refunded payments have status `refunded` and drop out).
* `orders` = orders created that day that are not cancelled.
* `date` used to be `"D-3"` style placeholders; it is now a real date.

## 2. `analytics:admin`

Request: none. Roles: insight.

Existing fields (same names; definitions tightened, see "Definitions"):
`orders` (all orders ever, incl. cancelled), `gmv`, `revenue`, `customers`, `sellers`, `liveProducts`, `pendingDisputes`, `pendingPayouts`, `commissionUsd`, `ordersByStatus` (`{status: count}`).

Added:

| Field | Meaning |
|---|---|
| `commissionPct` | The `commissionPct` setting (default 12). `commissionUsd = revenue * commissionPct / 100` |
| `gmvByCategory` | `[{category, gmv, orders}]`, item value (`price*qty`) per product category on non-cancelled orders, biggest first (max 50); lines without a catalogue product count as `"Other"` |
| `ordersToday`, `gmvToday` | non-cancelled orders created since 00:00 UTC |
| `ordersLast30`, `gmvLast30` | last 30 UTC days including today |
| `gmvPrev30`, `gmvPrevPeriod` | the 30 days before that (the two names are the same number) |
| `gmvChangePct` | `(gmvLast30 - gmvPrev30) / gmvPrev30 * 100`, 1 decimal, `null` when the previous period is 0 |
| `refundsUsd` | sum of order payments with status `refunded` |
| `subscriptionRevenueUsd` | succeeded seller-plan payments |
| `aov` | `gmv / non-cancelled orders` |
| `alerts` | see below |

`alerts`: `Array<{ kind, severity: 'info'|'warning'|'critical', count, message, messageFr }>`, only entries with `count > 0`, most severe first.

| `kind` | Counts | Severity |
|---|---|---|
| `unassigned_deliveries` | deliveries `unassigned` for more than 60 min | warning, critical at >= 5 |
| `pending_payments` | non-COD payments `pending` for more than 30 min | warning, critical at >= 5 |
| `open_disputes` | disputes/returns with status `open` | warning, critical at >= 10 |
| `payout_requests` | payouts `requested` | warning |
| `out_of_stock` | live products with stock 0 | warning |
| `low_stock` | live products with 1..9 units | info |
| `products_pending_moderation` | products `pending` | info |
| `sellers_pending` | sellers `pending` | info |

## 3. `analytics:finance` (new)

Request: none. Roles: **finance** (`admin`, `admin_finance`) only. Everyone else, including `admin_operations`, is refused.

```jsonc
{
  "currency": "USD",
  "commissionPct": 12,
  "grossGmvUsd": 4836,            // totalUsd of non-cancelled orders, all time
  "deliveryFeesUsd": 15,          // inside grossGmvUsd
  "promoDiscountsUsd": 0,         // promo-code discounts already deducted from totals
  "collectedUsd": 1800,           // succeeded order payments (cash actually received; COD counts once collected)
  "commissionEarnedUsd": 203.52,  // commissionPct x item value of DELIVERED orders (the base payouts use)
  "commissionExpectedUsd": 375,   // same rate on orders not yet delivered and not cancelled/returned
  "subscriptionRevenueUsd": 0,    // succeeded seller-plan payments
  "refundsUsd": 0, "refundsCount": 0,
  "payouts": { "paidUsd": 0, "paidCount": 0, "pendingUsd": 0, "pendingCount": 0, "requestedCount": 0, "rejectedCount": 0 },
                                  // pending = requested + approved
  "receivables": {                // mobile-money charges still waiting for the subscriber / finance confirmation
    "count": 0, "amountUsd": 0, "oldestMinutes": 0,
    "byMethod": [ { "method": "airtel_money", "count": 1, "amountUsd": 21, "oldestMinutes": 3 } ]
  },
  "codOutstandingUsd": 3036, "codOutstandingCount": 4,   // cash on delivery not collected yet
  "walletLiabilityUsd": 250,      // sum of customer wallet balances
  "series30": [ { "date": "2026-10-17", "gmv": 4836, "orders": 5, "revenue": 1800, "refunds": 0 } ]  // 30 daily rows
}
```

`commissionPct` is the existing admin setting (`settings:set {key:'commissionPct'}`, 0..60). There is no separate "commission rate" setting. No mobile-money fee total exists because fees are not tracked.

## 4. `analytics:warehouse`

Request: none. Roles: any `admin*` role and `warehouse_staff` (unchanged).

Existing fields: `totalParcels`, `unassigned`, `inTransit`, `delivered`, `codToCollect` (COD of parcels not delivered **and not failed**), `byStatus`.

Added:

| Field | Meaning |
|---|---|
| `throughput` | last 7 days, `[{date, received, pickedUp, delivered}]`: parcels scanned in at the hub / collected by a rider / delivered that day |
| `avgPickupToDeliveryMinutes` | average minutes from rider pickup to delivery, parcels delivered in the last 30 days that have both timestamps; `null` when there is no sample |
| `pickupToDeliverySamples` | how many parcels that average is over |
| `failureRatePct` | `failed / (delivered + failed)` x 100 for parcels created in the last 30 days |
| `failed30`, `delivered30` | the counts behind it |
| `agedOver24h` | open parcels (not delivered/failed) older than 24 h |
| `byZone` | `[{zoneId, parcels, delivered, failed}]`, last 30 days, max 30 zones |
| `byHub` | `[{hubId, hub, batches30}]`: dispatch batches built per hub in the last 30 days (parcels themselves are not assigned to hubs) |

Delivery tasks now record `pickedUpAt` and `deliveredAt`. Tasks delivered before this shipped fall back to their last update time for the `delivered` throughput, and have no pickup time.

## 5. `analytics:seller` (new)

Request `{ days?: number (1..90, default 30), sellerId?: string, top?: number (1..20, default 5) }`.

Roles:
* `seller`: always their **own** store. A `sellerId` sent by a seller is ignored (they cannot read another store).
* insight roles (`admin`, `admin_operations`, `admin_finance`): must pass the store's `sellerId` (the `Seller.id`, as in `sellers:list`), otherwise `{ok:false,error:'Choose a store (sellerId).'}`.
* everyone else: refused. A seller without a store gets `'Open a store first.'`.

```jsonc
{
  "sellerId": "...", "days": 30, "from": "2026-09-18", "to": "2026-10-17",
  "revenue": 4821, "orders": 5, "units": 9, "aov": 964.2,
  "revenueSeries": [ { "date": "2026-10-17", "revenue": 4821, "orders": 5, "units": 9 } ],   // `days` rows
  "topProducts": [ { "productId": "...", "name": "...", "units": 5, "revenue": 1745 } ],
  "customers": {
    "total": 12,               // distinct buyers, whole store life
    "repeat": 3,               // of them with more than one order
    "repeatRatePct": 25,
    "windowActive": 4,         // buyers who ordered inside the window
    "windowNew": 3,            // ... whose first-ever order with this store is inside the window
    "windowReturning": 1       // ... who had bought before the window
  },
  "fulfilment": {              // orders PLACED in the window that contain the store's products
    "ordersPlaced": 5,
    "avgHoursToReady": 6.5,    // order created -> seller pressed "ready" (null: no data)
    "avgHoursToDelivered": 52.1,   // order created -> delivered (null: no data)
    "cancelRatePct": 0, "returnRatePct": 0, "disputeRatePct": 0   // orders with a return / dispute / cancelled, per 100 orders
  },
  "reviews": { "average": 4.5, "count": 2, "replied": 1 },       // visible reviews on the store's products; average null when count is 0
  "health": { "score": 95, "grade": "A", "components": [ { "key": "cancel", "score": 100, "weight": 0.25, "value": 0 } ] },
  "funnel": { "views": 340, "orders": 5, "conversionPct": 1.5 }
}
```

* `revenue` / `orders` / `units` / series / top products count order lines of the store's products on orders that are **not cancelled or returned**, by order creation date. Delivery fees and promo-code discounts are not part of the seller's revenue.
* **Store health score** (0..100, `null` when there is nothing to judge): weighted average of five linear components, a component with no data is dropped and the other weights re-normalised.

  | key | 100 points at | 0 points at | weight |
  |---|---|---|---|
  | `ready` (avg hours to pack) | <= 12 h | >= 72 h | 25% |
  | `cancel` (cancel rate) | 0% | >= 20% | 25% |
  | `problems` (return + dispute rate) | 0% | >= 15% | 20% |
  | `reviews` (average rating) | 5.0 | <= 2.0 | 20% |
  | `repeat` (repeat-buyer rate) | >= 30% | 0% | 10% |

  Grade: A >= 85, B >= 70, C >= 55, otherwise D. The formula is documented next to `computeStoreHealth` in `api/src/ops/analytics.util.ts` and unit-tested.
* **Funnel**: `views` counts product-detail fetches (`products:get`) by **customers and guests** of the store's live products in the window (the owning seller and staff are not counted; it is page views, not unique visitors). `orders` = orders placed in the window. `conversionPct = orders / views`. It is a coarse real number, not a full click-stream funnel (no add-to-cart/checkout steps are tracked).
* A new store returns zeros, empty/zero series and `null` for averages and the health score.

## 6. `sellers:stats` (fixed)

Request: none (the signed-in seller's own store; any other role gets zeros). Same fields as before: `products`, `orders`, `revenue`, `paidOut`, `pendingPayouts`.

Now computed in SQL. `orders`/`revenue` exclude cancelled and returned orders (they used to include them); `products` excludes removed listings; `paidOut` / `pendingPayouts` now match the seller's payouts correctly (they were always 0 before because payouts are keyed by user id).

---

## 7. Campaign discounts

`campaigns:create` / `campaigns:update` accept, besides the existing fields (`name`, `nameFr`, `discount` 0..90 percent, `budgetUsd`, `startDate`, `endDate`, `productCount`):

* `productIds?: string[]` (max 200). A seller may only list their own products; an unknown id is refused. Empty/omitted = **every product of the campaign's store**. `productCount` is set to the list length. The response now includes `productIds` (array).
* `startDate` / `endDate` are `YYYY-MM-DD` (end date is inclusive, to 23:59:59 UTC) or full ISO timestamps; an end before the start is refused.

There is no separate `discountPct` field: the percentage is the existing `discount`.

When does a campaign discount? Only if `discount > 0` and
* status `active` (approved by an admin with `campaigns:setStatus`) and now is inside its dates (a missing date is open-ended), or
* status `scheduled` (approved, waiting) and its start date has passed (and the end has not).

`pending`, `draft`, `rejected` and `ended` never discount. Sellers cannot edit an approved campaign (admins can), and a client can never set status or the counters.

**Pricing rule (storefront and checkout use the same code):** per product, the unit price is the **lowest** of the listing price, a running flash-sale price and the best running campaign price (`price * (1 - discount/100)`, rounded to cents). Flash sales and campaigns **never stack** (on a tie the flash sale wins). A **promo code** stays a cart-level coupon applied on top of the already-discounted subtotal (it cannot take the total below zero).

Product payloads (`products:list`, `products:get`, `product:created/updated` pushes) now carry, in addition to the effective `price` / `originalPrice` (the old price, struck through) / `discount`:

| Field | |
|---|---|
| `campaignPct` | percent off from the winning campaign; **0** when no campaign set the price |
| `campaignId`, `campaignName` | the campaign (null otherwise) |
| `basePrice` | the stored listing price |
| `priceSource` | `'base' \| 'flash' \| 'campaign'` |

When an admin changes a campaign's status or terms, up to 100 affected products are pushed as `product:updated` with the new effective price.

Orders (`orders:create` ack, `orders:list`): `campaignDiscountUsd` on the order (already deducted from `subtotalUsd`/`totalUsd`), and on each line `priceUsd` (charged), `listPriceUsd` (normal price), `campaignId`, `campaignPct`. Campaign counters `orders` and `revenueUsd` are incremented on each sale. Client-sent prices/discounts are ignored.

## 8. Reviews

* `reviews:list {productId, includeHidden?}` public. Hidden reviews are excluded; `includeHidden:true` is honoured only for `moderate` roles. Rows now have `status` (`'visible'|'hidden'`), `sellerReply` (string|null), `sellerReplyAt` (ISO|null).
* `reviews:seller {limit?, offset?}` seller's feed (visible reviews only, with `productName`, `sellerReply`).
* **`reviews:reply {reviewId, text}`** (2..1000 chars). Roles: the `seller` who owns the product, or `moderate` roles. Anyone else gets `'Not allowed.'` / `'Review not found.'`. A second reply replaces the first. Ack: the review. Pushes `review:updated` (full review) to the author, the seller and staff (and to shoppers while visible) and notifies the author (`type:'review'`, title "The seller replied to your review").
* **`reviews:setStatus {reviewId, status: 'visible'|'hidden'}`**. Roles: `moderate`. Hidden reviews leave the public list and the product's `rating` / `reviewsCount` (recomputed from visible reviews; 0 when none). Pushes `review:updated`: shoppers receive only `{id, productId, status:'hidden'}` when hiding. Audit-logged.
* **`reviews:admin {status?, productId?, limit?, offset?}`** moderation queue, roles `moderate`; rows include `productName`. Default 200 rows.

## 9. Verification policy

Public setting **`requireVerifiedForCheckout`** (`'true'|'false'`, readable by everyone in `settings:get`, editable by `config` roles). When `'true'`, `orders:create` and `wallet:topup` fail with an error telling the user to verify their phone number or email (Profile > Verification) unless the account has `phoneVerified` **or** `emailVerified`. Apps should read the setting (and `me:get` flags) to show the prompt before calling.

Defaults: `'false'` in the dev seed (demo accounts are unverified), **`'true'` in `bootstrap:prod`** (inserted only when the key is missing). Production needs SMTP (email link) and/or Twilio (SMS code) configured, otherwise customers cannot verify and cannot check out; set it to `'false'` until they are.

## 10. Hub directory

* `warehouse:hubs {activeOnly?}` (staff) now returns every hub with `active` and `address`; `activeOnly:true` hides inactive hubs.
* **`warehouse:saveHub {id?, name, city, country?, address?, capacity?}`**. Roles: `hubs` (`admin`, `admin_operations`). No `id` = create, `id` = edit (omitted fields keep their value). Validation: name 2..100 chars and unique (case-insensitive), city 2..100, capacity integer 1..1,000,000 (default 500), address 3..200 or null. An `active` flag in this form is ignored. Ack: the hub.
* **`warehouse:setHubActive {id, active: boolean}`**. Roles: `hubs`. The last active hub cannot be deactivated. `warehouse:createTransfer` refuses an inactive hub.
* Push `hub:updated` (hub) to admins and warehouse staff after either write. Both writes are audit-logged.

## 11. Seller subscription plans

* **`sellers:plans`** (public) returns `Array<{ id, name, nameFr?, priceUsd: number|null, months, maxProducts?, features: string[], featuresFr?, popular? }>` from the `sellerPlans` setting (JSON, admin-editable, validated; default `free` $0, `starter` $49, `pro` $99, `enterprise` price `null` = contact sales). `maxProducts` is an optional listing quota enforced by `products:create`; `features` are display text only.
* **`sellers:subscribe {plan, method, phone?}`**. Role: `seller` with a store that is not rejected/suspended. `method` is `wallet` or a mobile-money network (`airtel_money`, `orange_money`, `vodacom_mpesa`; `phone` required for those). Free and `null`-price plans are refused.
  * wallet: charged immediately, plan active on return: `{status:'active', plan, payment, seller}`.
  * mobile money: `{status:'pending', plan, payment, seller}` with a `payment` of `purpose:'plan'` (`subject` = plan id). It is confirmed by the network webhook or by finance (`payments:confirm`), and then the plan activates; the seller is pushed `seller:updated`, and `payment:updated` fires as for any payment.
  * The plan lasts `months` (default 1) from now; renewing the same plan before it ends adds to the time left; switching plans starts a fresh period.
* The seller row (`sellers:mine`, `sellers:list`, `seller:updated`) now carries `plan` and `planExpiresAt` (ISO|null). `sellers:mine`, the `sellers:subscribe` ack and the activation push also add `activePlan`, the plan actually in force (a lapsed paid plan reads `'free'`). The public `sellers:storefront` shows `plan` as the plan in force and never the expiry. Sellers cannot set these fields themselves (`sellers:update` ignores them).
* Payments with `purpose:'plan'` appear in `payments:list`, in finance's receivables while pending, and in `subscriptionRevenueUsd` once succeeded.

## 12. List paging (all lists keep returning a plain array)

These accept optional `limit` and `offset`: `products:list`, `orders:list`, `delivery:list`, `delivery:unassigned`, `payments:list`, `customers:list`, `sellers:list`, `reviews:seller`, `reviews:admin`, `warehouse:parcels`, `warehouse:aged`, `warehouse:inventory`.

Defaults are generous so existing apps are not truncated: **500** rows (staff queues that were already capped at 200 keep **200**); an explicit `limit` is capped at **1000**; a bad `limit`/`offset` falls back to the default/0. To page, send `limit` and `offset` and stop when fewer than `limit` rows come back. `products:list` now filters by status inside the query (shoppers: live only; a seller: live plus their own non-removed listings), then pages.

## 13. Definitions that changed (same field names)

| Field | Before | Now |
|---|---|---|
| `analytics:admin.gmv` | sum of all orders incl. cancelled | non-cancelled orders |
| `analytics:admin.revenue` | all succeeded payments (incl. top-ups) | succeeded **order** payments |
| `analytics:admin.commissionUsd` | revenue x fixed 12% | revenue x `commissionPct` |
| `analytics:warehouse.codToCollect` | all non-delivered | non-delivered and non-failed |
| `analytics:revenue[].date` | `'D-n'` placeholders | `YYYY-MM-DD` |
| `sellers:stats.orders/revenue` | included cancelled/returned | excludes them |

## 14. Database, migration, indexes

Migration `1792000000000-AnalyticsCampaignsReviews` (reversible; MySQL, like the others; dev SQLite uses `synchronize`) adds: `campaigns.productIds`; `orders.campaignDiscountUsd`; `order_items.listPriceUsd/campaignId/campaignPct`; `reviews.status/sellerReply/sellerReplyAt`; `hubs.address/active`; `sellers.plan/planExpiresAt`; `payments.subject` (and payment purpose `'plan'`); `delivery_tasks.pickedUpAt/deliveredAt`; table `product_views`; and indexes `orders(status,createdAt)`, `orders(createdAt)`, `payments(status,createdAt)`, `delivery_tasks(status)`, `products(status,sellerId)`, `products(sellerId)`, `order_items(productId)` (orders by customer was already indexed).

Day bucketing uses SQL `DATE()` on `createdAt`, i.e. the database clock: run MySQL in UTC (the default in most deployments) so buckets are UTC days.
