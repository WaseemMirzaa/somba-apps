# Nearest-warehouse delivery, seller flows and live dashboards — plan

Status: **answers received, building** (2026-10-25). Planned by Opus 5.5; to be built by Sonnet 5.5.
Inputs: four code audits of the seller portal, the warehouse/zone model, support and the customer app, and every
flow across seller, warehouse, admin, customer and rider dashboards. Answers to §6 may change details.

---

## 1. Where things stand (short)

- **Almost everything is already on the live backend.** No seller, admin or warehouse screen in these flows runs on
  demo data. The problems are dead-ends, missing actions, missing notices and live updates that don't fire.
- **Delivery today:** one task per order, one rider goes **seller → customer directly**. Zones decide the fee and the
  warehouse. Warehouses (hubs) have **no coordinates**, and there is **no distance code** anywhere. The hub only stamps
  "received"; it is not a real leg.
- **Support chat is live two-way** on the customer app, web shop, seller portal and admin portal. It has no
  attachments or unread counts, and the rider app has no support.
- **There is no seller mobile app.** The seller app is the seller portal in `web/`.

---

## 2. Seller features not connected to the backend (the list asked for)

| # | Feature | Today | Missing |
|---|---|---|---|
| S1 | Returns (seller side) | Read-only list | Seller accept / reject with reason, evidence, response deadline |
| S2 | Disputes (seller side) | Read-only ("sellers can't reply") | Seller reply / evidence; customers can't even open a non-return dispute |
| S3 | Replacements | Read-only | Seller approve / reject; dispatch has no delivery task (`dispatched` is a dead end) |
| S4 | Exchanges | Read-only | Same as S3, plus variant choice and price difference |
| S5 | Product Q&A | **No page; questions can never be answered** | Seller Q&A inbox, notice to seller on a new question |
| S6 | Order list | Capped at 200–500 orders, paged in the browser | Server-side paging, search, filters; statements and earnings rebuilt from that cap |
| S7 | Customer city on orders | Always "—" (API sends no address) | Coarse city in the seller order view |
| S8 | Shipping / tracking | Carrier hardcoded, tracking = order ref | Real rider name, status times and pickup info from the delivery tasks |
| S9 | Finance: per-order earnings | Browser treats "delivered" as ready to pay | Show the server clearance hold, `paid_out`, min payout, commission |
| S10 | Finance: monthly statements, transactions | Computed in the browser from capped orders | Server statements endpoint + CSV |
| S11 | Finance: tax | Placeholder page | Commission invoice / summary (or hide) |
| S12 | Inventory | Absolute "set to N", reserved = allocated, threshold hardcoded 10 | Delta adjust, movement log, low-stock threshold per seller, low-stock notice |
| S13 | Promotions | Live, but views/clicks never counted, budget never enforced | Count views/clicks, enforce budget or hide it; flash-sale notice to seller |
| S14 | Reviews | Live reply | Notice to seller on a new review; "report review"; reply box on product page |
| S15 | Notifications | Live bell | Missing producers: new review, new question, low stock, flash sale, return/exchange status |
| S16 | Settings | Profile + plan live; goals in browser storage | Notification preferences, change password (API exists, no UI); goals on the server |
| S17 | Support | Live | Order link on seller tickets; seller tickets stamped "customer" |
| S18 | Storefront | Live basics | Vacation mode, handling time, map-pinned pickup location (needed for routing, §3) |
| S19 | Products | Live, one image | Multiple images, real SKU, bulk import (large; not for today) |
| S20 | Team / documents | Not built | Sub-accounts, 2FA, invoices (large; not for today) |
| Leak | Disputes/replacements/exchanges send the customer's full name and id to sellers | — | Trim on the server |

## 3. New delivery model: nearest warehouse with its own riders

**Rules (owner):** no zones. Several warehouses, each with its own riders. Each order goes automatically to the
**nearest warehouse that has riders**. That warehouse's staff assign their own riders, for the pickup from the seller
and the delivery to the customer.

**Design (defaults; see questions Q1–Q8):**
- **Hubs** gain `lat`, `lng` (admin sets them with a map picker), plus `active`. Riders and warehouse staff
  **must** belong to one hub.
- **Routing at order time** (`api/src/common/geo/`): use haversine distance from the customer's pinned address to each
  active hub that has ≥1 active rider, and take the nearest. Store `orders.hubId`. No pin → fall back to a hub in the
  same city → else the nearest active hub, with an admin alert. No hub with riders → keep the order on the nearest
  active hub and alert that hub's staff and admins (Q5).
- **Two legs, two tasks** (`delivery_tasks.kind`: `pickup` | `delivery`):
  1. **Pickup leg:** one task per seller on the order. The rider collects from the seller's pickup location and brings
     it to the hub. Hub scan-in completes the leg.
  2. **Delivery leg:** created when every pickup is scanned in. A rider takes it from the hub to the customer, with the
     delivery code and COD as today.
  - Customer order statuses stay the same words: confirmed → processing (pickup) → shipped (at hub) →
    out for delivery → delivered.
- **Assignment:** warehouse staff assign a rider from **their own hub** for each leg. Riders of other hubs can't see or
  take the task. Rider self-accept is off by default (Q3).
- **Fee:** zones go, so the fee becomes **base + per-km** from the hub to the customer, capped, set in admin settings.
  The API returns a quote so the cart and checkout show the same number the order charges (Q4).
- **Removed:** the admin zones page, zone pickers and fees on web and app, rider "My zone" and zone pills,
  preferred zones. The old `zoneId` columns stay nullable for history. The API ignores a `zoneId` sent by old app
  builds.
- **Fixed alongside:** hub scoping leaks (`warehouse:parcels/aged/batches/reconcile/receive`, `buildBatch` task check),
  warehouse staff not receiving stock/product updates, and analytics "by zone" → "by warehouse".
- **Seed and bootstrap:** Kinshasa and Paris hubs get coordinates, riders get hubs, and demo addresses get pins.

## 4. Flows to make fully live (all dashboards)

Each flow is listed with its steps and what is added. A ✚ marks a step built new.

**Return** (customer → seller → warehouse → admin)
1. The customer opens a return with **the items and quantities** plus photos ✚.
2. The seller **accepts or rejects** with a reason within 48 h ✚. A rejection or no answer → the customer can escalate,
   and admin decides.
3. **Return pickup** ✚: the hub assigns its rider to collect from the customer and bring the goods to the hub. The hub
   scans them in and grades the condition ✚.
4. The refund covers **the returned items only** ✚ (wallet, or phone via pawaPay). Only those items are restocked ✚.
5. The seller, admin and warehouse dashboards and notifications update live at every step. Return window enforced ✚.

**Dispute** (non-return problem: missing item, damaged, wrong item, not received)
1. The customer opens a dispute ✚ (an entry point exists today only for returns).
2. The seller replies with a message and evidence ✚.
3. Admin decides: refund all or part, replacement, or reject with a reason ✚. Every party is notified.

**Replacement and exchange**
1. The customer creates one (app ✚ for exchange variants; web create page ✚).
2. The seller approves or rejects ✚.
3. The warehouse **dispatches with a real delivery task** to the customer ✚. That closes the `dispatched` dead end, and
   the faulty unit is collected on the same trip.
4. Stock comes from the seller ✚. A price difference is charged or refunded ✚. The customer gets a status screen ✚.

**Q&A:** the customer asks → the seller (and moderators) get a notice ✚ and answer from a Q&A inbox ✚ → the answer
appears live on the product page.

**Reviews:** new review → seller notice ✚. Seller reply (exists). Seller can **report** a review ✚. Moderation hides
it → author and seller notified ✚.

**Promotions:** campaign approve/reject with a reason ✚, scheduled campaigns flip prices live, views/clicks counted ✚.
Flash sale: shopper prices flip live ✚, a start/end sweep ✚, the shop deals page shows real flash sales with a
countdown ✚, and the seller is notified ✚.

**Finance:**
- Seller earnings follow the server clearance hold ✚.
- `paid_out` is set ✚.
- Server monthly statements + CSV ✚.
- Commission summary ✚.
- Payout request → finance approve/send → paid (exists) with notices to super admin ✚.
- Admin finance figures refresh on status changes ✚.

**Analytics:** seller, admin and warehouse figures refresh when statuses change ✚. Warehouse analytics are scoped to
the staff member's hub ✚.

**Support:** order link and category on every client ✚, photo attachments ✚, unread counts ✚, a notice to agents when
a customer replies ✚, new tickets reach all admin roles ✚.

**Settings:** a seller notification-preferences and password page ✚, goals on the server ✚, and admin/warehouse
settings refresh live ✚.

**Inventory:**
- Delta stock adjust with a movement log ✚.
- Low-stock threshold per seller with a notice ✚.
- Warehouse inventory live for warehouse staff ✚.
- Transfers between warehouses: hidden for now (stock is per seller, not per warehouse) — Q9.

**Notifications:**
- Every step above produces a saved notice and push for the right people ✚.
- The super admin sees role notices ✚.
- Read state is stored on the server ✚.
- The warehouse portal gets a notifications page ✚.

## 5. Build split (parallel Sonnet 5.5 agents, disjoint files)

1. **API — delivery & warehouses:**
   - hubs geo, routing, two-leg tasks, assignment, fee quote, zone removal;
   - hub scoping, migration, seed, smokes (`warehouse-zones-smoke` → `warehouse-routing-smoke`).
2. **API — after-sale & engagement:**
   - returns/disputes/replacements/exchanges actions and logistics hooks, Q&A, reviews, promotions/flash;
   - finance statements, inventory deltas, notification producers, support upgrades, settings.
   - Owns its services; gateway edits are only in its own handler regions.
3. **Web:**
   - seller pages (actions, Q&A inbox, finance, settings, inventory);
   - warehouse pickup/delivery desks, admin hub map + routing views, shop changes;
   - refresh fixes, nav and role fixes.
4. **Apps:**
   - customer: no zones, pin required, item-level return with photos, exchange/replacement status, live Q&A, support attachments;
   - rider: pickup vs delivery leg cards, no zone pills, support screen.

Then Opus reviews, runs all tests and smokes on a fresh seeded DB, tests every flow end to end, and records the videos.

**Videos to deliver:**
- **Seller dashboard, one clip per flow** (captioned): orders, returns, disputes, replacements, exchanges,
  promotions, reviews, Q&A, finance, analytics, support, settings, inventory, notifications. Each clip shows the
  other parties' dashboards reacting live.
- **Customer app:** full purchase → nearest-warehouse pickup → delivery, in EN and FR.

**Not for today (large, listed for later):** per-warehouse stock and transfers, warehouse staff tiers, multiple product
images / SKU / bulk import, seller team accounts and 2FA, tax documents, seller coupons, chat with the seller.

## 6. Owner's answers (2026-10-25) — these override §3–§5 where they differ

1. **Three legs through two warehouses.**
   - **Origin warehouse** = the nearest warehouse (with riders) to the **seller**. **Destination warehouse** = the
     nearest warehouse (with riders) to the **customer**.
   - **Leg 1, pickup:** an origin-warehouse rider collects from the seller and brings the parcel to the origin
     warehouse.
   - **Leg 2, transfer:** origin staff assign a rider (origin or destination warehouse's, by staff) to move the parcel
     from origin to destination. The destination warehouse scans it in.
   - **Leg 3, delivery:** destination staff assign their own rider to the customer.
   - If origin = destination, there is no transfer leg.
2. Yes, the parcel goes through the warehouse(s), as in 1.
3. Staff assign riders from their own warehouse for each leg; no rider self-accept. (default)
4. **Fee:**
   - Base + per-km from the destination warehouse to the customer, capped.
   - Plus an inter-warehouse transfer fee when origin ≠ destination.
   - All set in admin settings. (default, extended for answer 1)
5. No warehouse with riders → accept the order, use the nearest active warehouse, and alert staff and admins.
   (default)
6. The map pin is required on app and web. A legacy unpinned address falls back to a warehouse in the same city.
   (default)
7. Multi-seller orders: one pickup per seller (each from that seller's origin warehouse). The delivery leg starts once
   every package has reached the destination warehouse.
8. Returns: the seller accepts/rejects within 48 h → escalation → admin. A warehouse rider collects from the customer;
   the return runs the legs in reverse back to the seller's warehouse. (default)
9. Stock transfers between warehouses stay hidden. Seller stock stays with the seller. (default) Warehouses do track
   the **parcels in their custody** (inbound, on hand, outbound).
10. Refunds cover the returned items only (partial allowed): to the wallet by default, or to the phone by pawaPay.
    (default)
11. Replacement/exchange:
    - The seller approves.
    - Warehouse riders deliver the new unit and collect the old one on the same trip.
    - The price difference is charged to or refunded from the wallet. (default)
12. Support: photo attachments, order link and unread counts on every client, plus a rider-app support screen answered
    by admin support. (default)
13. **Videos in both English and French.**
14. **Build everything, including the "not for today" list:**
    - warehouse staff tiers;
    - multiple product images, SKU, brand and weight, bulk CSV import;
    - seller team accounts and 2FA;
    - tax documents and commission invoices;
    - seller coupons and flash-sale nomination;
    - direct customer ↔ seller chat;
    - storefront vacation mode, handling time and policies.
    - Per-warehouse stock = warehouse custody of parcels (see 9).

## 7. Cross-agent contracts (builders code against these names)

- **Geo:** `api/src/common/geo/geo.ts` exports `haversineKm(a, b)` and `nearestHub(point, hubs)`. Hubs have `lat`,
  `lng`, and riders/staff have `users.hubId` (required for those roles). Sellers have `pickupLat`, `pickupLng`
  (required to sell) and `originHubId` (computed).
- **Orders:** `orders.originHubIds` (JSON, one per seller) and `orders.destinationHubId`.
  - Fee quote event `delivery:quote { addressId | geo, lines[] } → { feeUsd, destinationHubId, originHubIds, transfer }`.
  - `orders:create` charges exactly the quoted fee and ignores `zoneId`.
- **Delivery tasks:** `delivery_tasks.kind` is one of `pickup | transfer | delivery | return_pickup |
  return_transfer | return_to_seller | replacement_delivery`. It also gets `fromHubId`, `toHubId`, `sellerId`
  (pickup legs), `parentTaskId` and `disputeId | replacementId | exchangeId`.
- **Logistics service** (owned by the logistics builder), `api/src/logistics/logistics.service.ts`:
  - `planOrder(order)` creates the pickup tasks.
  - `onScanIn(taskId, hubId)` advances to the next leg.
  - `createReturnPickup({ disputeId, orderId, items })`.
  - `createReplacementDelivery({ replacementId | exchangeId, orderId })`.
  - Each returns the created task. Other builders call these and never write delivery tasks directly.
- **Events (new):**
  - `logistics:*` (warehouse desk: `logistics:queue`, `logistics:assign`, `logistics:scanIn`,
    `logistics:dispatchTransfer`, `logistics:custody`), push `task:updated`.
  - `hubs:*` (admin CRUD with geo).
  - `delivery:quote`.
- New handlers go in **new gateway files per module** (as `cart.gateway.ts` and `search.gateway.ts` already do).
  Edit `realtime.gateway.ts` only to remove or adjust handlers you own.
- **Migrations** (one per builder, in its own range):
  - logistics `17929500000xx`;
  - after-sale/engagement `17929600000xx`;
  - commerce `17929700000xx`;
  - seller platform `17929800000xx`.
- **Each API builder writes its contract** (events, payloads, pushes, statuses) to `docs/contracts/<area>.md`. The web
  and app builders build from those files.
