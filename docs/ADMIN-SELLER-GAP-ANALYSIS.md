# Admin & Seller Center — gap analysis vs. leading marketplaces

Scope: the operator back-office (`web/src/app/admin/**`) and the Seller Center (`web/src/app/seller/**`,
`sell-online`) with the NestJS API behind them (`api/src/**`), compared with **Jumia** (Vendor Center + ops),
**Amazon** (Seller Central, marketplace ops), **Flipkart** (Seller Hub) and **Shopify / Mirakl-style** operator
consoles. Code as of 2026-10-22. Companion to [CUSTOMER-APP-GAP-ANALYSIS.md](CUSTOMER-APP-GAP-ANALYSIS.md).

Priority: **P0** blocks or breaks a core flow today · **P1** expected of any major marketplace · **P2** differentiator.
Status: ✅ fixed in this pass · 🔶 partly · ⬜ open.

---

## A. Multi-seller orders (how a cart with several sellers works)

### Before this pass
- The cart already mixed sellers freely (never cleared), and checkout created **one order**, but nothing in the
  order knew about sellers: lines had no seller, there was **one status and one delivery task for everybody**.
- **Any one seller pressing "Ready" released the whole parcel** to the rider while the other sellers had not packed.
- A seller who could not supply an item had no way out except asking support to cancel the **whole** order.
- The rider's pickup was every seller's address joined in one string; the admin list showed only the first seller.

### What professional marketplaces do
| App type | Cart rule | Order model |
|---|---|---|
| General marketplaces (Amazon, Jumia, Flipkart, eBay, Etsy) | One cart, any number of sellers, never cleared | Checkout splits into **per-seller packages / sub-orders**, each with its own status, cancel and return; Jumia/Amazon consolidate at their hub and deliver once |
| Food / quick commerce (Uber Eats, Glovo, Swiggy, DoorDash) | **One store per cart** — adding from another store asks "Start a new cart?" | One order per store (cooked and dispatched from one place) |

Somba is a general marketplace with a hub (Jumia model), so it keeps the multi-seller cart and uses per-seller packages.

### What was built (✅)
- Every order line stores its **seller snapshot** (`sellerId`, `sellerName`) and its own **fulfilment** state
  `open → ready → received` or `cancelled` (+ `readyAt`, `receivedAt`, `cancelReason`, `refundedUsd`).
  Migration `api/src/database/migrations/1792300000000-SellerPackages.ts` (backfills existing lines).
- **Each seller readies only their package**; the rider/hub is released only when **every** seller has packed.
- **Seller partial cancel** (`orders:sellerCancel {orderId, reason, itemIds?}`): only that seller's lines are
  cancelled, restocked and refunded (prepaid → wallet, promo discount shared pro rata; COD → less cash to collect);
  the rest of the order continues; if nothing is left the whole order is cancelled.
- A later full cancel/refund never pays back or restocks a seller-cancelled line twice (`PaymentsService.outstanding`).
- The hub scan receives only packed packages; cancelled sellers drop off the pickup list.
- Seller views show only their lines, their subtotal, their **package status** and how many sellers share the order.
  Seller revenue, stats and payouts exclude cancelled lines. COD orders (which stay `pending` until the rider
  collects) can now be readied — previously they never could.
- Customer app, web storefront, seller portal and admin show **"Sold by"**, packages per seller and cancelled lines.
- Tests: `api/test/multi-seller-smoke.cjs` (30 end-to-end checks), `api/test/p0-fixes-smoke.cjs` (122), `api/src/orders/package-status.spec.ts`.

### Still open
| Feature | Priority |
|---|---|
| Per-seller delivery promise / ship-by deadline and late-package alert | P1 |
| Per-package returns and partial refunds on disputes (returns are still whole-order) | P1 |
| Hub scan per seller package (today one scan per parcel receives every packed package) | P2 |

---

## 0. Bugs found (fix first)

| # | Problem | Where | Status |
|---|---|---|---|
| A-B1 | Admin list/detail show one seller, no packages | `admin/orders/page.tsx`, `[id]/page.tsx` | ✅ |
| A-B2 | "Move to Delivered" by hand skipped the rider, COD collection and unlocked payouts; any status jump allowed | `orders.service.ts updateStatus`, `admin-live.ts` | ✅ one forward step; delivered closes the task and records COD |
| A-B3 | Seller partial cancel + later full cancel refunded the line twice and restocked twice | `orders.service.ts`, `payments.service.ts` | ✅ |
| A-B4 | "Refund to original method" moved no money | `payments.service.ts refund` | ✅ refused with a clear message; wallet refund only |
| A-B5 | Refund forced `returned`, never restocked, left the rider delivering | `payments.service.ts refund` | ✅ |
| A-B6 | Percent coupons rounded to whole dollars | `content/promos.service.ts` | ✅ |
| A-B7 | Coupons could not be paused; flash sales could not be ended or listed once over | gateway, `promotions`, `flash-sales` pages | ✅ |
| A-B8 | Fraud "Block" blocks nothing; alert raised after fulfilment opens | `ops/fraud.service.ts` | ⬜ P1 |
| A-B9 | Broadcast "all" notifies customers only; no confirm; not audited | `ops/broadcasts.service.ts` | ⬜ P1 |
| A-B10 | Nav vs server permissions disagree (Support can't open disputes; Moderation can't save categories) | `lib/admin-access.ts`, gateway `GROUPS` | ⬜ P1 |
| A-B11 | Super Admin gets no alert for payouts, disputes, seller applications, tickets | role-targeted notifications | ⬜ P1 |
| A-B12 | Refunds, dispute decisions, product takedowns, campaigns, broadcasts not audited; audit page has no filter | gateway, `audit.service.ts` | 🔶 refunds / admin cancel / coupon & flash-sale actions audited |
| A-B13 | Reinstating a seller does not restore listings; no reason stored | `ops/sellers.service.ts` | ✅ reject/suspend need a reason the seller sees; reinstating restores the listings the suspension drafted |
| A-B14 | Customer wallet not shown; no wallet adjust; Suspend shown to roles that can't | `admin/customers/[id]` | ⬜ P1 |
| A-B15 / S-B16 | Commission is one live global %, never stored per order → history rewrites itself | `payouts.service.ts` | ✅ stored per order line (`commissionPct`/`commissionUsd`); per-payout settlement statements + CSV + batch approve |
| A-B16 | Admin lists silently capped (200–500 rows), client-side search | `realtime-context.tsx`, list endpoints | ⬜ P1 |
| A-B17 / S-B1 | A seller could edit a live listing (title, image, price) with no re-review | gateway `products:update` | ✅ back to review when moderation is on |
| A-B18 | Hub scan marked unpacked lines received | `delivery.service.ts` | ✅ |
| A-B19 | Any ops role could change order status; no operator cancel after packing | gateway, `orders.service.ts` | ✅ `orders:adminCancel {orderId, reason}` until the rider collects |
| A-B20 | Campaign budget never enforced; approvals ungoverned | `flows/campaigns.service.ts` | ⬜ P1 |
| A-B21 | Dispute/return detail flashes "not found" while loading | `admin/disputes/[id]`, `returns/[id]` | ⬜ P2 |
| S-B2/B3 | Product image accepts any URL; category not checked against the table | `products.service.ts` | ⬜ P1 |
| S-B4 | Stock adjust writes an absolute value (can overwrite a reservation) | `stock-adjust.tsx`, `products:update` | ⬜ P1 |
| S-B5 | Payouts never clawed back after a refund | `payouts.service.ts` | ✅ balance can go negative ("owed"); requests blocked |
| S-B7 | Seller could not cancel a rider-assigned single-seller order | `orders.service.ts` | ✅ until the rider collects |
| S-B8 | Seller revenue/commission counted cancelled lines | `analytics.service.ts`, `sellers.service.ts`, `seller.tsx` | ✅ |
| S-B9 | "Ready" state kept only in the browser | `lib/seller.tsx` | ✅ server state |
| S-B10 | Seller "Replacements" page always empty | `flows/replacements.service.ts` | ⬜ P1 |
| S-B11 | Seller not told live when a rider is assigned | `delivery.service.ts` | ⬜ P1 |
| S-B12 | Sellers got no persisted notification for a new order or a cancellation | `orders.service.ts` | ✅ (push / email still ⬜) |
| S-B13 | Seller dispute list leaks customer id and full name | `disputes.service.ts` | ⬜ P1 |
| S-B14/B15 | Unpaid orders counted as sales; every delivered order labelled "ready for payout" | `lib/seller.tsx` | 🔶 unpaid excluded |
| S-B17 | Suspended seller cannot see in-flight orders or earnings | `store-gate.tsx` | ⬜ P1 |
| S-B18/B19 | Plan features not enforced; badges/ratings never updated | `plans.ts`, `seller.entity.ts` | ⬜ P1 |
| S-B20 | A seller could buy (and review) their own listing | `orders.service.ts create` | ✅ |
| S-B21 | Seller order list ignored listings stored under the user id | `orders.service.ts` | ✅ |
| S-B22..B25 | Seller tickets mislabelled; fake tracking number; uploads unbounded; goals local only | various | ⬜ P2 |

---

## 1. Admin (operator console)

| Area | Feature | Jumia | Amazon | Flipkart | Somba | Priority |
|---|---|---|---|---|---|---|
| Sellers | KYC: ID, RCCM / tax no., bank, documents, review | ✓ | ✓ | ✓ | ✅ legal name, phone, ID, RCCM, tax no., documents, terms; admin review with reason; resubmit (bank still at payout time) | done |
| Sellers | Approve / reject / suspend **with reason**, resubmit | ✓ | ✓ | ✓ | no reason | P1 |
| Sellers | Per-seller / per-category commission | ✓ | ✓ | ✓ | one global % | P1 |
| Catalogue | Pending-first moderation queue, reject reason codes | ✓ | ✓ | ✓ | list + buttons, no reason | P1 |
| Catalogue | Re-review on edit of a live listing | ✓ | ✓ | ✓ | ✅ | — |
| Catalogue | Variants, multiple images, attributes per category, bulk import | ✓ | ✓ | ✓ | ✗ | P1 (P0 for fashion) |
| Orders | Multi-seller packages view | ✓ | ✓ | ✓ | ✅ | — |
| Orders | Enforced status machine, operator cancel with reason | ✓ | ✓ | ✓ | ✅ | — |
| Orders | Server-side search, filters (payment, seller, zone, SLA), paging, CSV | ✓ | ✓ | ✓ | client-side over ≤500 rows; payment filter ✅ | P1 |
| Orders | SLA clocks / breach list, timeline, notes, tags, holds | ✓ | ✓ | ✓ | ✗ | P1 |
| Orders | Invoice / packing slip / label printing | ✓ | ✓ | ✓ | ✗ | P1 |
| Returns | Return window, item-level return & partial refund, seller response + evidence, SLA | ✓ | ✓ | ✓ | whole-order, text only | P1 |
| Returns | Refund to original payment method | ✓ | ✓ | ✓ | wallet only (honest now) | P1 |
| Money | Settlement statements, commission invoices, tax/VAT, auto payout cycles, batch approve, CSV | ✓ | ✓ | ✓ | 🔶 statements + CSV + batch approve; no invoices / VAT / auto cycles | P1 |
| Money | Clawback / negative balance | ✓ | ✓ | ✓ | ✅ | — |
| Health | Late-shipment rate vs promise, seller-fault cancel rate, ODR, thresholds → warn/suspend | ✓ | ✓ | ✓ | score shown, no thresholds | P1 |
| Customers | Wallet view + adjust with reason, blocklists, timeline | ✓ | ✓ | ✓ | ✗ | P1 |
| Promotions | Coupon pause / resume, flash sale end, list all, price check | ✓ | ✓ | ✓ | ✅ | — |
| Promotions | Scope by category / seller, seller-funded, budgets | ✓ | ✓ | ✓ | ✗ | P1 |
| Fraud | Velocity / address / device rules, hold-for-review, real block | ✓ | ✓ | ✓ | COD alert only | P1 |
| Staff | Editable permission matrix, deactivate staff, 2FA, full audit + export | ✓ | ✓ | ✓ | fixed roles, partial audit | P1 |
| Reports | CSV export anywhere, scheduled reports | ✓ | ✓ | ✓ | ✗ | P1 |
| Settings | Tax rates, return window, handling time, free-shipping threshold | ✓ | ✓ | ✓ | ✗ | P1 |

## 2. Seller Center

| Area | Feature | Jumia | Amazon | Flipkart | Somba | Priority |
|---|---|---|---|---|---|---|
| Onboarding | KYC, terms acceptance, phone/email verification, saved verified payout account, checklist | ✓ | ✓ | ✓ | name + pickup address | P1 |
| Store | Vacation mode, handling time, policies, map-pinned pickup | ✓ | ✓ | ✓ | ✗ | P1 |
| Listings | Variants, multi-image, SKU/brand/weight, category attributes, bulk CSV | ✓ | ✓ | ✓ | ✗ | P1 (P0 fashion) |
| Inventory | Delta stock adjust, low-stock alerts, movement log | ✓ | ✓ | ✓ | absolute write, dashboard only | P1 |
| Orders | Own lines + package status, ready per package, cancel own items with reason | ✓ | ✓ | ✓ | ✅ | — |
| Orders | Ship-by SLA countdown, packing slip / label, hand-over proof, CSV | ✓ | ✓ | ✓ | ✗ | P1 |
| Notifications | New order / cancellation in-app | ✓ | ✓ | ✓ | ✅ | — |
| Notifications | Push, email/SMS, low stock, return opened, Q&A, SLA alerts | ✓ | ✓ | ✓ | ✗ | P1 |
| Returns | Accept / reject / counter, evidence, deadline | ✓ | ✓ | ✓ | read-only | P1 |
| Engagement | Q&A inbox, buyer messaging (masked), report review | ✓ | ✓ | ✓ | review reply only | P1 |
| Promotions | Seller coupons, flash-sale nomination, stop own campaign | ✓ | ✓ | ✓ | campaigns only | P1 |
| Money | Stored commission per line, per-payout statements, invoices, tax docs | ✓ | ✓ | ✓ | 🔶 stored per line + per-payout statements; no invoices / tax docs | P1 |
| Health | Targets, warnings, tier badges | ✓ | ✓ | ✓ | score only | P1 |
| Team | Staff sub-accounts with roles, 2FA | ✓ | ✓ | ✓ | ✗ | P1 |
| Apps | Seller mobile app / PWA, API & webhooks | ✓ | ✓ | ✓ | ✗ | P2 |

---

## 3. Next fixes, in order (open P1s)
1. ~~Seller KYC + decision reasons + listing restore on reinstate (A-B13, onboarding rows).~~ ✅ done
2. ~~Commission stored per line at order time; per-payout statements~~ ✅ done (+ CSV, batch approve); commission invoices still open (A-B15).
3. Returns: window, item-level returns and refunds, seller response with evidence, seller notified (S-B13).
4. Server-side search/paging + CSV export for orders, customers, payouts (A-B16).
5. Variants + multiple images + SKU, bulk CSV listing/stock import, delta stock adjust (S-B4).
6. Permissions/notifications/audit alignment (A-B10, A-B11, A-B12 rest), staff deactivate + 2FA.
7. Ship-by SLA with countdown, packing slip / label, late-shipment health metric and thresholds.
8. Fraud rules that hold orders; broadcast confirm + audience fix (A-B8, A-B9).
9. Seller push/email notifications, low-stock alerts, Q&A inbox.
10. Seller coupons and flash-sale nomination; plan features enforced; badges maintained (S-B18, S-B19).
