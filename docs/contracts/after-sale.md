# After-sale and engagement contract — returns, disputes, replacements, exchanges, Q&A, reviews, support, the bell

Owner: the after-sale API builder. Web (seller, admin, warehouse, shop) and app (customer, rider) builders code against
this file. Companion to `docs/WAREHOUSE-SELLER-FLOWS-PLAN.md` §4, §6 (answers 8, 10, 11, 12) and §7, and to
`docs/contracts/logistics.md` (which creates the delivery tasks). Code: `api/src/disputes`, `api/src/flows`,
`api/src/content` (reviews, support), `api/src/notifications`, `api/src/after-sale`.

Everything is a Socket.IO event on the one socket every client already opens. A request gets the standard ack
`{ ok: true, data }` or `{ ok: false, error }`. Errors are stable English strings: clients map them to French by exact
match (the list is in §11). Every new handler lives in its own gateway file (`disputes.gateway.ts`, `after-sale.gateway.ts`,
`engagement.gateway.ts`, `support.gateway.ts`, `notifications.gateway.ts`); the matching handlers were removed from
`realtime.gateway.ts`. Names that existed before keep working with the same payloads (new fields are additions).

**Sellers** act as their store: a seller account or a team member with the right permission (`orders` for returns,
disputes, replacements, exchanges; `support` for Q&A and review replies, see `seller-platform.md`). A seller whose
store is suspended can read but not answer.

---

## 1. Settings (public: every client may read them in `settings:get`; admin writes with `settings:set {key, value}`)

| key | meaning | validation | default |
|---|---|---|---|
| `returnWindowDays` | a return can be opened this many days after delivery. `0` = returns closed | whole number 0–90 | 7 |
| `sellerResponseHours` | a seller answers a return, replacement or exchange within this time | number 0.001–720 | 48 |

Both are seeded (`seed.ts`, `bootstrap-prod.ts`); a missing row means the default.

---

## 2. Returns and disputes (`type: 'return' | 'dispute'`)

### 2.1 The record (`DisputeView`, in every payload, list and push)

```
id, reference ("RET-…" / "DP-…"), orderId, orderReference,
customerId, customerName          // sellers get NO customerId and the FIRST NAME only (§10)
type, category, reason, status, stage,
attachments: string[]             // the customer's photos (upload URLs)
items: [{ id, disputeId, orderItemId, productId, productName, productNameFr, variant, variantFr,
          qty, unitPriceUsd, refundUsd, condition: 'resellable'|'damaged'|'unsellable'|null, restockedQty }]
sellerId                          // the store concerned; null = the request names no store (whole order / two stores)
sellerDueAt, sellerRespondedAt, sellerReason, escalatedAt
resolution, outcome: 'refund_full'|'refund_partial'|'replacement'|'reject'|'return_refund'|null
refundUsd, refundTo: 'wallet'|'phone'
receivedAt, gradedAt, pickupTaskId
canEscalate: boolean              // the customer may escalate now
canCancel: boolean                // the customer may cancel now
createdAt, updatedAt
// only on disputes:get:   messages: DisputeMessage[], messageCount
// only on disputes:open:  siblings?: string[]   (ids of the other requests when the return spanned several stores)
```

`status`: `open | resolved | rejected` (rejected = closed without a refund/decision for the customer; a cancelled request is
`rejected` with resolution "Cancelled by the customer"). `stage` says where an **open** request is; a closed one has
`stage: 'closed'`.

| stage | meaning | who moves it on |
|---|---|---|
| `awaiting_seller` | waits for the seller (return: yes/no; dispute: reply) | seller / timeout |
| `seller_replied` | (dispute) the seller answered in the thread | support decides |
| `seller_rejected` | (return) the seller said no | customer escalates / cancels |
| `seller_timeout` | (return) the seller did not answer in `sellerResponseHours` | customer escalates / cancels |
| `escalated` | (return) with Somba support | support approves / refuses |
| `approved` | (return) yes, no pickup task yet (logistics could not create one: the warehouse collects by hand) | warehouse |
| `pickup` | (return) a `return_pickup` task exists (`pickupTaskId`) | warehouse scans it in |
| `received` | (return) the goods are at the warehouse; the refund failed or the return pre-dates the new flow | finance resolves |
| `closed` | done (`status` resolved / rejected) | — |

`category`: dispute → `missing | damaged | wrong_item | not_received | other`; return →
`damaged | wrong_item | not_as_described | changed_mind | defective | other`. Optional; anything else is refused.

Return flow in one line: `awaiting_seller` → seller yes → `pickup` → warehouse scan-in → **refund of the returned items only**
→ `closed/resolved`. Seller no or silence → customer `disputes:escalate` → support `returns:decide`. Grading by the warehouse
(`returns:grade`) is what puts goods back on the shelf; the refund does not wait for it.

### 2.2 Events

| event | who | payload | ack data |
|---|---|---|---|
| `disputes:eligibility` | customer | `{orderId}` | `{ eligible, reason: string\|null, windowDays, deliveredAt, endsAt, items: [{itemId, productId, productName, variant, qty, remaining, unitPriceUsd}] }` — what can still be returned and whether the window is open. `reason` is one of the return errors in §11 |
| `disputes:open` | customer | `{ orderId, type: 'return'\|'dispute', reason (≥5 chars), category?, items?: [{itemId? \| productId?, qty?}], attachments?: string[] (≤6 upload URLs), refundTo?: 'wallet'\|'phone' }` | `DisputeView` (+ `siblings`) |
| `disputes:list` | any signed-in | `{status?, type?, stage?, limit?, offset?}` | `DisputeView[]` (customer: own; seller: their store's + own purchases; warehouse: returns; admin: all) |
| `returns:list` | same | same without `type` | returns only |
| `disputes:get` | a party or staff | `{id}` | `DisputeView` with `messages` |
| `disputes:reply` | customer / seller of the request / admin | `{ id, message, attachments? }` | `DisputeMessage` `{id, disputeId, authorId, authorName, role, text, attachments[], createdAt}` |
| `returns:respond` | seller (`orders`) | `{ id, accept: boolean, reason? }` (reason ≥5 chars when rejecting) | `DisputeView` |
| `disputes:escalate` | customer | `{ id, note? }` (note joins the thread) | `DisputeView` |
| `disputes:cancel` | customer | `{ id }` (only before the seller said yes) | `DisputeView` |
| `returns:decide` | `admin`, `admin_support`, `admin_operations`, `admin_finance` | `{ id, approve: boolean, reason? }` (reason ≥5 chars when refusing) | `DisputeView` |
| `disputes:decide` | same roles; refunds need `admin` or `admin_finance` | `{ id, outcome: 'refund_full'\|'refund_partial'\|'replacement'\|'reject', amountUsd? (partial), reason? (needed for reject), items?: [{itemId, qty}] (replacement), refundTo? }` | `DisputeView` |
| `returns:grade` | `warehouse_staff`, admins | `{ id, grades: [{ itemId (the dispute item id), condition: 'resellable'\|'damaged'\|'unsellable', restockQty? }], note? }` | `DisputeView` |
| `disputes:markReceived` | warehouse, admins | `{ disputeId, restock? = true }` | `DisputeView` — the old desk button; `restock` grades everything resellable and shelves it. Prefer the logistics scan-in |
| `disputes:resolve` | admins (refund: `admin`, `admin_finance`) | `{ disputeId, resolution?, refund?, force? }` | `DisputeView` — a refund on a return pays the **returned items only**; on a dispute everything outstanding |
| `disputes:reject` | admins | `{ disputeId, resolution? }` | `DisputeView` |

Rules the server enforces (`C-nn` marks the code):
- **C-R1** only a `delivered` order, within `returnWindowDays` of delivery (the delivered delivery task's time, else the order's last change).
- **C-R2** at most the units bought, minus units on another request that is open or paid (a refused or cancelled request frees them). No lines given = everything that is left. A return over several stores becomes **one request per store** (`siblings`).
- **C-R3** a refund never exceeds what is left on the payment (`PaymentsService.outstanding`: earlier part-refunds and seller-cancelled lines are out), and is serialised by a row lock.
- **C-R4** escalate only from `seller_rejected` / `seller_timeout`.
- **C-R5** grading: `restockQty` ≤ returned qty; only `resellable` goods go back on the shelf; one grading per return. A restock is `products.restock(…, {reason: 'return_restock'})` for the line's option.
- A dispute: one open per order. A dispute may name lines (`items`) or none (the whole order).
- A state change is one conditional `UPDATE … WHERE stage IN (…)`: two people acting at once → one wins, the other gets "This request was just updated by someone else. Refresh and try again."
- Refund `refundTo: 'phone'` goes back through pawaPay when the payment allows it (one phone refund per payment), otherwise to the wallet.
- A full return of every unit turns the order `returned`; a part-return leaves it `delivered`. `order_items.refundedUsd` carries the money per line (seller earnings/statements should read it).

### 2.3 Pushes (rooms in brackets)

- `dispute:created`, `dispute:updated` → `DisputeView` to the customer, the admin roles, `warehouse_staff` (returns only), and each seller of the request (**seller copy has no `customerId`, first name only**).
- `dispute:message` → `{ disputeId, message }` to the customer, admins and the sellers (also to the author, for their other devices).
- Plus `notification:new` (§8). Money moves push `wallet:updated`, `wallet:transaction`, `payment:updated`, `order:updated` as always.

### 2.4 Hooks the logistics module calls (already wired in `after-sale/logistics-listener.ts`)

`LogisticsService.registerListener` is used: a `return_pickup` task `scanned_in` (or `delivered`) calls
`DisputesService.onReturnReceived(disputeId)`; a `replacement_delivery` leg `picked_up | in_transit | delivered` calls
`ReplacementsService.syncFromDelivery(id, status)` / `ExchangesService.syncFromDelivery(id, status)`. Nothing to do on the
logistics side. After-sale calls `LogisticsService.createReturnPickup({disputeId, orderId, items})` on approval and
`createReplacementDelivery({replacementId | exchangeId, orderId})` on approval (through `after-sale/logistics-bridge.ts`,
which logs and carries on when logistics refuses, e.g. "This order has no destination warehouse.").

---

## 3. Replacements and exchanges

### 3.1 Records

`ReplacementView`: `id, reference ("REP-…"), orderId, orderReference, customerId*, customerName*, sellerId, sku (the product id),
productName, productNameFr, reason, condition, qty, variant, attachments[], status, dispatchStatus, sellerDueAt,
sellerRespondedAt, sellerReason, stockTaken, deliveryTaskId, deliveredAt, disputeId, createdAt, updatedAt`.

`ExchangeView`: `id, reference ("EXC-…"), orderId, orderReference, customerId*, customerName*, sellerId, fromSku, fromName,
fromNameFr, fromVariant, toSku, toName, toNameFr, toVariant, qty, priceDiffUsd, heldUsd, reason, status, sellerDueAt,
sellerRespondedAt, sellerReason, stockTaken, deliveryTaskId, deliveredAt, createdAt, updatedAt`.
(`*` = not sent to sellers / first name only.)

Status: replacement `requested → approved → [received → allocated →] dispatched → delivered`, or `rejected`; exchange
`requested → approved → [received → ready →] dispatched → delivered`, or `rejected`. `received/allocated/ready` are the
old warehouse desk steps and stay optional. **`dispatched` is no longer a dead end**: it follows the delivery task
(picked up → `dispatched`, delivered → `delivered`, with `deliveredAt`).

### 3.2 Events

| event | who | payload | ack data |
|---|---|---|---|
| `replacements:create` | customer (delivered order); staff for any | `{orderId, itemId? \| (sku, productName), reason?, condition?, qty?, attachments?}` — `itemId` = the order line's id (`order.items[].id`), which also tells two options of one product apart; `sku` + `productName` still work | `ReplacementView` |
| `replacements:list` / `exchanges:list` | any | `{status?, limit?, offset?}` | views (customer: own; seller: their store's + own; ops: all) |
| `replacements:mine` / `exchanges:mine` | any | `{status?, limit?, offset?}` | the caller's own requests as a customer (the customer status screen) |
| `replacements:get` / `exchanges:get` | party / staff | `{id}` | view |
| `replacements:respond` | seller (`orders`), admins | `{id, approve, reason?}` (reason ≥5 chars when rejecting) | view |
| `replacements:setStatus` | warehouse, admins | `{id, status}` (valid steps only) | view — `approved`/`rejected` take the same path as `respond` |
| `exchanges:create` | customer; staff | `{orderId, itemId? \| (fromSku, fromName), toSku, toName, toVariant?, qty?, reason?, attachments? (≤6 upload URLs, same rule as returns), priceDiffUsd? (staff only, for items outside the catalogue)}` | `ExchangeView` (`attachments: string[]`) |
| `exchanges:respond` / `exchanges:setStatus` | as above | `{id, approve, reason?}` / `{id, status}` | view |

Rules:
- **C-X1** the item must be on the order (customers). **C-X2** one open replacement / exchange per item.
- Approving **takes stock from the seller's product** (`products.reserve`, the chosen option, reason `replacement`); with too little stock it fails with "Not enough stock …" and the request stays `requested`. It then calls `LogisticsService.createReplacementDelivery`; `deliveryTaskId` is the first leg. A refusal after approval puts the stock back.
- An exchange names `toVariant` (the option label, "Size: 42"; required from customers when the product has options (optional for staff); must differ from the current option on the same product). The **price difference is computed on the server** (`(current price of the new item − price paid) × qty`); a customer cannot set it.
- **C-X3** a positive difference is **held from the customer's wallet when they file the exchange** (`heldUsd`; wallet line "Exchange EXC-…: price difference"); too little balance → refused with "Your wallet balance is too low for the price difference ($X). Top up your wallet and try again." and nothing is saved. A rejection returns the hold once. A negative difference is refunded to the wallet **when the exchange is delivered**. Exchanges filed by staff move no money.
- A `toSku` that is not a catalogue product (customer free text, older apps) is accepted with no price difference, no hold and no stock taken; staff settle it.
- The seller has `sellerResponseHours` (`sellerDueAt`); nothing happens automatically when it passes (support can answer for them: `respond` accepts admins).

Pushes: `replacement:updated`, `exchange:updated` → the view to the customer, admin roles, `warehouse_staff` and the seller (seller copy without `customerId`).

---

## 4. Q&A

`ProductQuestion` now also has `askerId`, `sellerId` (the store), `answeredAt`.

| event | who | payload | ack data |
|---|---|---|---|
| `questions:list` | anyone | `{productId, limit? (200), offset?}` | `PublicQuestion[]` newest first: `{ id, productId, askedBy (FIRST name only), question, answer, answeredBy, answeredAt, createdAt }` — never `askerId` / `sellerId` |
| `questions:ask` | signed-in | `{productId, question}` | the question |
| `questions:seller` | seller (`support`) | `{status?: 'unanswered'\|'answered'\|'all', limit?, offset?}` | questions on my products + `productName, productNameFr, productImage` |
| `questions:unanswered` | seller | `{}` | `{count}` (the badge) |
| `questions:answer` | seller of the product, admins | `{id, answer}` | the question |

Pushes: `question:created` → the product's seller (and `customer`, admin rooms as before); `question:updated` → the asker (`askerId`), the seller, shoppers (`customer`, `guest`) and admins.
Notices: see §8.

---

## 5. Reviews

| event | who | payload | ack data |
|---|---|---|---|
| `reviews:report` | seller of the product (`support`) | `{id, reason}` (5–500 chars) | `ReviewReport` — one report per store and review; the review stays visible until a moderator acts |
| `reviews:reports` | moderators | `{id}` | the reports on a review |
| `reviews:admin` | moderators | `{status?, productId?, reported?: true, limit?, offset?}` | reviews (+ `reportCount`, `moderationReason`) |
| `reviews:setStatus` | moderators (`admin`, `admin_operations`, `admin_moderation`) | `{reviewId, status: 'visible'\|'hidden', reason?}` | the review. Hiding stores `moderationReason`, closes the reports, **notifies the author and the seller with the reason**; restoring notifies them too |
| `reviews:helpful` | signed-in | `{id}` | the review + `counted` — **one vote per person**, a repeat changes nothing (`counted:false`) |
| `reviews:create` | buyer | unchanged | the review — the seller gets `review:created` live and a notice |

Review rows gain `reportCount`, `moderationReason`. Pushes: `review:created` → the seller; `review:reported` → `{review, report, productName}` to moderators; `review:updated` also to the author and the seller.

---

## 6. Support

Tickets: `id, reference, userId, userName, role (the creator's role: customer|seller|rider|…), subject, category, orderId, status, assigneeId, assigneeName, userUnread, staffUnread, messages, createdAt, updatedAt`.
`messages` is **still a JSON string** `[{ id, from, fromId, role, text, at, attachments: string[] }]` (now assembled from the `support_messages` table).

| event | who | payload | ack data |
|---|---|---|---|
| `support:open` | **any signed-in role** (customer, seller, rider, …) | `{subject, message, category? (a slug), orderId?, attachments?: string[]}`. `orderId` is checked: a customer -> their own order; a seller (owner or team member) -> an order with at least one line of THEIR store; a rider -> an order they carry or carried (a task of theirs on it); admins / warehouse staff -> any. Otherwise `Order not found.` | ticket |
| `support:list` | any | `{status?, assignee?: 'me', limit?, offset?}` (filters are admin-only; others get their own) | tickets |
| `support:get` | owner / admins | `{id}` | ticket |
| `support:reply` | owner / admins | `{id, text?, attachments?}` (text or a photo). A **closed** ticket takes no reply: `This ticket is closed. Open a new ticket if you still need help.` (customers) / `This ticket is closed. Reopen it first.` (agents, via `support:setStatus`). A resolved one still reopens by a customer reply | ticket |
| `support:setStatus` | admins | `{id, status: 'open'\|'pending'\|'resolved'\|'closed'}` — validated | ticket |
| `support:markRead` | owner / admins | `{id}` | ticket — owner zeroes `userUnread`, an agent zeroes `staffUnread` (shared by the team) |
| `support:assign` | admins | `{id, assigneeId: string\|null}` (an active admin-role account; null = back to the queue) | ticket |

- `userUnread` counts staff messages the owner has not read; `staffUnread` the owner's messages the agents have not read. The owner screen shows `userUnread`, the agent screens `staffUnread`.
- An `orderId` must exist; a customer can link only their own order.
- Each message carries the sender's real role. An agent's first reply takes the ticket (`assignee*`).
- Messages are rows: simultaneous replies never overwrite each other; counters are atomic.
- Push `support:updated` → the ticket to its owner and to **all admin roles** (also on open).
- Rider links: `linkFor('rider','support', id)` = `/rider/support/<id>` (list `/rider/support`); warehouse `/warehouse/support`.

---

## 7. The bell

| event | who | payload | ack data |
|---|---|---|---|
| `notifications:list` | any | `{}` | newest 100: the user's own rows plus their role's, each `{…, read, link, titleFr, bodyFr}` |
| `notifications:markRead` | any | `{id}` | `{id}` — a role-wide notice is marked read **for this person only** |
| `notifications:markAllRead` | any | `{}` | `{count}` — own and role-wide ones |

- **The super admin (`admin`) sees every admin role's notices** (live, push and list). A notice for all admin roles (`toAdmins`) is **one row** (`role: 'admins'`) every admin sees and reads on their own, instead of a copy per role.
- Read state of role-wide rows lives in `notification_reads` (per person); user-addressed rows keep their `read` flag.
- Warehouse staff list their notices with the same event; their default link is `/warehouse/notifications`.
- Push per category: `me:setPrefs {notify: {order, payout, stock, review, question, message, product, promo}}` (seller platform) is honoured for user pushes **and now for staff role pushes**; `push:false` still silences everything. `email` / `sms` preferences are stored but nothing sends them.

---

## 8. Notices (every one is saved, pushed live and by FCM, and has a French text in `localize.ts`)

`type` decides the link (`notifications/links.ts`). `entityId` is the record id unless noted.

| title | to | type | opens |
|---|---|---|---|
| Return requested / Dispute opened | `admin_support` (+ super admin) | return / dispute | `/admin/returns/:id`, `/admin/disputes/:id` |
| Return requested on your order / Dispute opened on your order | the seller(s) | return / dispute | `/seller/returns/:id`, `/seller/disputes/:id` |
| Return accepted | customer (seller said yes) | return | `/shop/returns/:id` |
| Return approved | customer + seller (support said yes); `warehouse_staff` when no pickup task | return | |
| Return rejected | customer (seller said no, with the reason) | return | |
| Return escalated | `admin_support`, the seller | return | |
| Seller did not respond | customer, seller, `admin_support` (timeout) | return | |
| Return received / Returned goods received | customer / seller | return | |
| Returned goods graded | the seller | return | |
| Refund issued | customer (every refund: wallet or phone) | payment | `/shop/orders` |
| Return resolved / Return closed / Dispute resolved / Dispute closed | customer + seller (with the resolution or reason) | return / dispute | |
| Return refund failed | `admin_finance` (goods are back, the automatic refund failed: resolve by hand) | return | |
| Return reply / Dispute reply | the other parties + `admin_support` | return / dispute | |
| Replacement requested on your item / Exchange requested on your item | the seller | replacement / exchange | `/seller/replacements/:id` |
| Replacement approved/rejected/dispatched/delivered (and Exchange …) | customer, seller; `warehouse_staff` on approval | replacement / exchange | `/shop/replacements/:id`, `/shop/exchanges/:id` |
| New question on your product | the seller | question | `/seller/questions?focus=:questionId` |
| New product question | `admin_moderation` | question | `/admin/reviews?focus=:id` |
| Your question was answered | the asker; `entityId` = **the product id** | question | `/shop/products/:id` |
| New review on your product | the seller | review | `/seller/reviews?focus=:id` |
| Review reported | `admin_moderation` | review | `/admin/reviews?focus=:id` |
| Your review was hidden / is visible again | the author, with the reason | review | |
| A review on your product was hidden / is visible again | the seller | review | |
| New support ticket | all admin roles (one row) | support | `/admin/support/:id` |
| New reply on a ticket | the assigned agent, else `admin_support` | support | |
| Support reply | the ticket owner (customer / seller / rider) | support | `/shop|seller|rider/support/:id` |
| Ticket assigned to you / Ticket resolved / closed / reopened | the assignee / the owner | support | |

Bodies are data only (references, names and the people's own words), so they need no translation.

Wallet history lines added (French in `localizeWalletDescription`): `Refund for SOM-… (returned items)`, `Refund for SOM-… (dispute)`,
`Exchange EXC-…: price difference`, `Exchange EXC-… : price difference refunded`, `Exchange EXC-… rejected: price difference returned`.

---

## 9. Data model (migration `1792960000001-AfterSale.ts`, reversible)

New tables: `dispute_items`, `dispute_messages`, `review_reports`, `review_helpful`, `support_messages`, `notification_reads`.
New columns: `disputes` (category, stage, attachments, sellerId, sellerDueAt, sellerRespondedAt, sellerReason, escalatedAt, outcome, refundUsd, refundTo, gradedAt, pickupTaskId), `reviews` (reportCount, moderationReason), `product_questions` (askerId, sellerId, answeredAt), `support_tickets` (role, assigneeId, assigneeName, userUnread, staffUnread; **`messages` column dropped**, its JSON moved into `support_messages` by the migration), `replacements` / `exchanges` (qty, variant(s), sellerDueAt, sellerRespondedAt, sellerReason, stockTaken, deliveryTaskId, deliveredAt; replacements: attachments, disputeId; exchanges: heldUsd). Existing disputes get `stage` from their status; questions get `sellerId` from the product.
Unique indexes: `review_reports (reviewId, reporterId)`, `review_helpful (reviewId, userId)`, `notification_reads (notificationId, userId)`.

## 10. Privacy

Disputes, replacements and exchanges sent to a **seller** (lists, `get`, every live push, the thread) carry the customer's **first name** and **no `customerId`**. A seller's own purchases stay whole. Messages in a dispute thread show a customer by first name.

## 11. Error messages clients show (add French; exact match)

Returns / disputes:
`Order not found.` · `Please describe the problem (at least a few words).` · `This order has not been paid for or was cancelled.` · `You already have an open request for this order.` · `Choose what is wrong from the list.` · `Photos must be a list of uploaded images.` · `Photos must be images uploaded through the app.` · `You can attach up to 6 photos.` · `You can return items once the order has been delivered.` · `Returns are not accepted at the moment.` · `Returns are accepted within N days of delivery, and that time has passed.` · `You can return at most N of "<name>".` · `Choose at least one item to return.` · `Choose how many of each item to return.` · `An item appears twice in the request.` · `One of the items is not on this order.` · `Only returns need an accept or reject; reply to the customer instead.` · `Tell the customer why you are rejecting this return.` · `The response time has passed; Somba support decides now.` · `This request was already handled.` · `This request was just updated by someone else. Refresh and try again.` · `Wait for the seller to answer, or for the response time to pass.` · `Only returns can be escalated; a dispute is already with Somba support.` · `It is too late to cancel: the return is already on its way.` · `Give the customer a reason for refusing the return.` · `Give the customer a reason for refusing.` · `Returns are approved or refused with returns:decide.` · `Use decide for disputes.` · `Outcome must be one of: refund_full, refund_partial, replacement, reject.` · `Enter the amount to refund.` · `That is more than what is left to refund on this order ($X).` · `There is nothing left to refund for these items.` · `That money was just refunded. Refresh and try again.` · `Only admin or finance can issue a refund.` · `Mark the returned goods as received at the warehouse before refunding.` · `These goods were already marked as received.` · `Only returns have goods to receive.` · `Receive the returned goods first.` · `These goods were already graded.` · `Grade each returned item.` · `One of the items is not part of this return.` · `Condition must be one of: resellable, damaged, unsellable.` · `Put back between 0 and N of "<name>".` · `Only resellable goods go back on the shelf.` · `Only returns have goods to grade.` · `Warehouse staff only.` · `This request is closed.` · `Write a message first.` · `Dispute not found.` · `Pick the item to replace.` · `Customers only.` · `Sellers only.` · `Admins only.` · `Ops only.` · `Not allowed.`

Replacements / exchanges:
`Order not found or not eligible for a replacement.` · `Order not found or not eligible for an exchange.` · `Say which item needs replacing.` · `Say which item you want to exchange and for what.` · `That item is not on this order.` · `You already asked for a replacement of this item.` · `You already asked to exchange this item.` · `Choose a different option to exchange for.` · `Choose a <option name> for "<product>".` (variant) · `That product is no longer available.` · `Not enough stock of that item for an exchange.` · `Not enough stock to send a replacement. Restock the item or reject the request.` · `Not enough stock for this exchange. Restock the item or reject the request.` · `Your wallet balance is too low for the price difference ($X). Top up your wallet and try again.` · `Tell the customer why you are rejecting this replacement.` / `… this exchange.` · `This replacement was just updated by someone else. Refresh and try again.` · `This exchange was just updated by someone else. Refresh and try again.` · `Can't move from X to Y.` · `Replacement not found.` · `Exchange not found.`

Q&A / reviews:
`Write your question first.` · `Write an answer first.` · `Review not found.` · `Tell the moderators what is wrong with this review (5 to 500 characters).` · `You already reported this review.` · `This review is already hidden.` · `Write a reply of 2 to 1000 characters.` · `Give a rating and write a short review.` · `You can review a product after it has been delivered to you.` · `You have already reviewed this product.`

Support:
`Subject and message are required.` · `Order not found.` · `Write a message first.` · `Status must be one of: open, pending, resolved, closed.` · `Choose an active admin account.` · `Ticket not found.`

## 12. Tests and what is not done

- API: `npm run smoke:aftersale` (needs the API with `AFTER_SALE_SWEEP_MS=1500`, see the header of `test/after-sale-smoke.cjs`); jest specs next to each service.
- Not done: automatic escalation of overdue **replacement / exchange** requests (only returns time out; `sellerDueAt` is informational there); email / SMS preferences are stored but nothing sends them; a seller-side "report a question" is not built.

## Integration fixes

- **Order line id.** Every order line has a stable `id` (`order.items[].id`, the `order_items` primary key). `disputes:open` / `disputes:decide` already took it as `itemId`;
  `replacements:create` and `exchanges:create` now take `itemId` too (the `sku` / `productId` forms keep working). An unknown `itemId` -> `That item is not on this order.`
- **Free-text exchange targets.** `toSku` that starts with `ext:` (or that is not in the catalogue) is *free text*: no catalogue lookup, no stock, no price (the
  customer's `priceDiffUsd` is ignored; staff settle it by hand and may set `priceDiffUsd`). A catalogue `toSku` is priced on the server and the difference is held from the wallet.
- **Exchange photos** (`attachments`) are stored on the exchange (`exchanges.attachments`) and served as `string[]`.
- **Questions.** Shoppers and guests get the public view (first name, no ids) in `questions:list`, in the `questions:ask` reply and in `question:created` /
  `question:updated` pushes; admins and the store get the full row (`askerId`, `sellerId`, full name). The asker's id stays server-side for notices.
- **Dispute resolution** text is bilingual: `DisputeView.resolutionFr` is the French of the stock phrases (`Refunded to wallet`, `Partially refunded`, `Replacement approved`,
  `Rejected`, `Resolved`, `Cancelled by the customer`) and an agent's own words unchanged.
- **Photo formats.** Photos (support, returns, replacements, exchanges, chat) must be files stored by `POST /api/v1/uploads`, which now writes png, jpg, webp **and heic**
  (iPhone photos); `.jpeg` links are accepted too. The upload error reads `Only JPEG, PNG, WebP or HEIC images are allowed.`
- **Links.** Admin notices for exchanges / replacements open `/admin/exchanges/<id>` and `/admin/replacements/<id>`.
