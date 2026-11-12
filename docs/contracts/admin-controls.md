# Admin controls after sale: returns, exchanges, messaging, express, store policies

Owner: workstream A1 (API). Web (seller, admin, warehouse, shop) and app (customer, rider) builders of Phase B code against
this file. It **supersedes** the seller parts of `docs/contracts/after-sale.md` (§2, §3, §8, §10), of
`docs/contracts/seller-platform.md` (§3 chat, §5 storefront) and of `docs/contracts/round2-seller-customer.md` (response time).
Code: `api/src/disputes`, `api/src/flows`, `api/src/chat`, `api/src/sellers` (`policy.service.ts`, `admin-controls.gateway.ts`,
`storefront.service.ts`), `api/src/notifications`.

Owner decisions this implements: (1) returns, disputes, exchanges and replacements are decided by KOMORIKO admin and support;
sellers see nothing (no menu, no buttons, no notices), only the goods coming back (return-to-seller legs) and the money effect in
Finance. (2) Express delivery is switched per store by admin, not by the seller. (3) Customer <-> seller chat is closed;
customers contact support; old chats stay readable by admin. (4) Every change to a store policy needs admin approval; admin can
edit and publish any store's policy; sellers get a returns-policy template. (5) "Seller response time" becomes "Support response
time" (setting key `sellerResponseHours` is unchanged).

Everything is a Socket.IO event on the one socket every client already opens: `{ ok: true, data }` or `{ ok: false, error, errorFr? }`.
**New fields are additions; no field an old client reads was removed or renamed** (see §10 for what an old build sees).

---

## 1. Returns and disputes go to support

### 1.1 The stage

New first stage **`awaiting_support`**. `DisputesService.open()` writes it for every return and every dispute (it is also the
column default). Flow now:

```
return:   awaiting_support -> (support approves) approved -> pickup -> received -> closed (refunded)   [unchanged from here on]
          awaiting_support -> (support refuses)  closed, status 'rejected'
dispute:  awaiting_support -> (support decides)  closed, status 'resolved' | 'rejected'
```

| stage | now |
|---|---|
| `awaiting_support` | **new**: waits for KOMORIKO support (`returns:decide` for a return, `disputes:decide` for a dispute) |
| `approved`, `pickup`, `received`, `closed` | unchanged |
| `escalated` | legacy: rows that were already there keep it; `returns:decide` still decides them. Nothing writes it |
| `awaiting_seller`, `seller_replied`, `seller_rejected`, `seller_timeout` | **legacy**: migration `1793480000001-AwaitingSupport` moved every OPEN row from `awaiting_seller`, `seller_rejected`, `seller_timeout` and `seller_replied` to `awaiting_support`. Nothing writes them. Clients should treat any of them like `awaiting_support` |

`DisputeView` keeps its shape. Changes in meaning: `canEscalate` is **always `false`** (kept so old clients read it); `sellerDueAt` is the
**support** deadline (`sellerResponseHours` after opening); `sellerLapsedAt` marks "support was alerted"; `sellerReason`,
`sellerRespondedAt`, `sellerReasonI18n`, `escalatedAt` only carry values on rows from before this change. `sellerId` still names the
store whose goods are concerned (it routes the return-to-seller legs); a return over several stores is still one request per store.

### 1.2 Events (what changed)

| event | before | now |
|---|---|---|
| `returns:respond` | seller answers yes/no | **retired**. Answers `{ ok: false, error: 'Returns are decided by KOMORIKO support.' }` for everyone (so an old build does not hang). Calls nothing |
| `disputes:escalate` | customer escalates | **retired**. Answers `{ ok: false, error: 'Your request is already with KOMORIKO support.' }` |
| `returns:decide` | admin/support, only on undecided (`awaiting_seller`, `seller_rejected`, `seller_timeout`, `escalated`) | admin, operations, support, finance (`disputeDesk`) decide any undecided return: now also `awaiting_support` (and the legacy stages). Approve starts the pickup exactly as before; refuse needs a reason (>= 5 chars) and closes it |
| `disputes:decide` | `awaiting_seller`... | decides from `awaiting_support` (legacy stages too) |
| `disputes:list`, `returns:list`, `disputes:get` | seller: their store's cases + own purchases | **seller: only their own purchases as a customer** (a seller account that never shopped gets `[]` / "Dispute not found."). Customer, desk and warehouse unchanged |
| `disputes:reply` | customer, seller, admin desk | customer and the desk only. A seller gets "Dispute not found." The stage no longer moves on a reply (`seller_replied` is gone) |
| `disputes:cancel` | customer, before the seller said yes | customer, until support has approved (it works from `awaiting_support`) |
| `disputes:markReceived`, `returns:grade`, `disputes:resolve`, `disputes:reject`, `disputes:open`, `disputes:eligibility` | | unchanged |

Money and goods flow is untouched: return pickup, `return_to_seller` legs (the seller still sees those legs and the goods coming
back through the delivery/logistics events), `markReceived`, settle/refund, restock, finance entries.

### 1.3 Pushes and notices

- `dispute:created` / `dispute:updated` / `dispute:message` now go to the customer, the `disputeDesk` roles and (returns) the
  warehouse of the return. **Never to a seller.**
- Support SLA: when an open return or dispute is still undecided after `sellerResponseHours` (default 48 h), the sweep
  (`AFTER_SALE_SWEEP_MS`) alerts `admin_support` (and so the super admin) **once**, sets `sellerLapsedAt`, emits `dispute:updated` and moves nothing. The customer and the seller are not told.

| notice (`title`) | recipient | body | French title |
|---|---|---|---|
| `Return waiting for support` | `admin_support` role | `RET-… · SOM-…` | Retour en attente du support |
| `Dispute waiting for support` | `admin_support` role | `DP-… · SOM-…` | Litige en attente du support |
| `Replacement requested` | `admin_support` role | `REP-… · SOM-… · <item>[: <reason>]` | Remplacement demandé |
| `Exchange requested` | `admin_support` role (not when staff filed it) | `EXC-… · SOM-…: <from> → <to>` | Échange demandé |
| `Return requested`, `Dispute opened`, `... reply`, `Return received` | as before (support / customer) | | unchanged |

**Removed notices to sellers** (the strings stay in `localize.ts`, old stored rows still need their French): `Return requested on your order`,
`Dispute opened on your order`, `Return accepted`, `Return approved` (seller copy), `Return rejected` (seller copy), `Return escalated`,
`Returned goods received`, `Returned goods graded`, `Return/Dispute resolved|closed` (seller copy), `Return/Dispute reply` (seller copy),
`Seller did not respond`, `Exchange/Replacement requested on your item`, `Exchange/Replacement <status>` (seller copy).
The customer notices are unchanged except `Return accepted` is gone: a return is now always `Return approved`.

### 1.4 Wording that changes (web + app)

Customer copy that mentions the seller step, the seller's answer, "escalate" or "seller response time" is obsolete
(`request-form`, `shop/returns/[id]`, `lib/after-sale.ts`, legal/returns §2, swap status; app `aftersale_request`, `messages_aftersale`,
`server_errors_features`). A request is "with KOMORIKO support" from the first second; the SLA is the **support response time**.

---

## 2. Exchanges and replacements are decided by support

- `replacements:respond` and `exchanges:respond` accept only `admin`, `admin_operations`, `admin_support` (group `exchangeDecide`).
  **A seller is refused** ("Not allowed."). The decision note (`reason`, needed >= 5 chars to reject) is still stored in `sellerReason`
  / `sellerReasonI18n` (field names unchanged).
- **Support has full control**: it now approves an exchange with a negative price difference too (a refund to the customer's wallet
  on delivery). The old error "Only operations can approve an exchange that refunds money to the customer's wallet." is gone.
  Filing such an exchange on a customer's behalf still needs finance (`C-X5`); moving an exchange through its steps is still
  the exchange desk + warehouse supervisors (`exchanges:setStatus`).
- `replacements:list|get`, `exchanges:list|get`: a seller sees only what they asked for as a customer. Live `replacement:updated` /
  `exchange:updated` no longer go to the seller.
- Stock failure when approving now reads: `Not enough stock to send a replacement. Ask the seller to restock the item, or reject the request.` /
  `Not enough stock for this exchange. Ask the seller to restock the item, or reject the request.` (French in the error catalogue).
- The seller lapse sweep (`SellerLapseService`) now alerts **support only**, once (`sellerLapsedAt`): titles `Replacement waiting for support`
  / `Exchange waiting for support` (`REF · SOM-…`). Customer and seller are not told.
- The seller keeps ONE notice about these: **`Pickup scheduled`** (the hand-over of the new unit: "a rider will collect your package"),
  now tagged with the reference: body `SOM-… · REP-…: a rider will collect your package.` (or `EXC-…`) for a replacement / exchange
  pickup, `SOM-…: a rider will collect your package.` for an ordinary order. French: `SOM-… · REP-… : un livreur viendra récupérer votre colis.`

---

## 3. Messaging

- **`chat:start`** and **`chat:send`** answer `{ ok: false, error: 'Messaging sellers is closed. Contact support from your account.' }`
  for every role (French in `errorFr`: "La messagerie avec les vendeurs est fermée. Contactez le support depuis votre compte.").
  Nothing is written, no push, no notice.
- Existing conversations stay stored. A **customer** still reads their own history (`chat:list`, `chat:messages`, `chat:markRead`,
  `chat:unread`, `translate:text` for a `chat_message` they are in). The **store side is gone**: an owner or team member gets `[]` from
  `chat:list`, "Conversation not found." from `chat:messages` / `chat:markRead`, and `{ total: 0, buyer: 0, seller: 0 }` from `chat:unread`.
  `chat:list { as: 'seller' }` always returns `[]`. No `chat:message` push is sent any more.
- **New, admin/support read-only** (roles `admin`, `admin_support`; everyone else "Not allowed."):

| event | payload | ack data |
|---|---|---|
| `chat:adminList` | `{ sellerId?, buyerId?, orderId?, q? (customer's or store's name), limit? (<= 200, default 50), offset? }` | `AdminConversationView[]`, newest activity first: `{ id, buyerId, buyerName, sellerId, storeName, storeLogo, productId, productName, productNameFr, productImage, orderId, orderReference, lastMessageAt, lastMessagePreview, lastMessageI18n?, messageCount }` (no `side`, no `unread`) |
| `chat:adminMessages` | `{ conversationId, before? (message id), limit? (<= 200, default 50) }` | `{ conversation: AdminConversationView, messages: MessageView[] (oldest first, `textI18n` when known), hasMore }` |

  Neither changes anything (no unread counter moves, nothing is pushed). `translate:text { kind: 'chat_message' }` now also accepts the support desk.
- The demo seed writes its conversations as history (`ChatService.importHistory`); no event reaches it.
- Web/app: remove "Message the seller" / "Contact seller" buttons and the Messages pages for sellers; customers use "Contact support" (support tickets).
  Notice type `chat` links now fall back to the portal's notifications page.

---

## 4. Express delivery is admin-managed

- **`sellers:setExpress { sellerId, enabled: boolean }`** — roles `admin`, `admin_operations` (group `logisticsDesk`); others "Not allowed.".
  Ack data: the store as the admin sees it (`expressDelivery` included, same shape as `sellers:get`). Turning it **on** needs the store's pickup
  location pinned (`pickupLat` / `pickupLng`): otherwise `This store has no pinned pickup location. Ask the seller to pin it in Store settings before turning on express delivery.`
  A non-boolean: `Express delivery must be true or false.` Unknown store: `Store not found.` Audited (`seller.express_on` / `seller.express_off`).
  Pushes `seller:updated` to the owner and the admins; the owner also gets a notice (`Express delivery turned on` / `turned off`;
  "KOMORIKO turned express delivery on|off for your store."; FR "Livraison express activée / désactivée", "KOMORIKO a activé / désactivé la livraison express pour votre boutique.") when the value actually changed.
- `sellers:update` **ignores `expressDelivery`** (an old client that still sends it gets no error and no change). Unpinning the pickup
  location (`pickupLat: null, pickupLng: null`) still switches express off. Routing is untouched.
- `expressDelivery` is still on every store view (`sellers:mine`, `sellers:get`, `sellers:list`, the public storefront, `sellerExpressDelivery` on products).
- Web: remove the seller's express card (`account-storefront-forms.tsx`); add the toggle on `admin/sellers/[id]`, disabled with the pin message when the store has no pin.

---

## 5. Store policies need approval

### 5.1 Data

Table `seller_policy_revisions` (migration `1793480000002-SellerPolicyRevisions`, reversible):
`id, sellerId, returnsPolicy, shippingPolicy, returnsPolicyFr, shippingPolicyFr, status 'pending'|'approved'|'rejected', note, proposedBy, decidedBy, decidedAt, createdAt`.
A text column is `null` = **not part of this change** (the live text stays), `''` = **cleared**, otherwise the text. `...Fr` is the same text written in French
(policies are authored in either language; the other one is an author row or filled in by the machine translator, exactly as before). One pending revision per store: a newer proposal replaces the
fields it names. **Existing policies are grandfathered**: one `approved` revision per store that had a returns or shipping policy (`decidedBy: 'system'`).

```
PolicyRevisionView = { id, sellerId, returnsPolicy, shippingPolicy, returnsPolicyFr, shippingPolicyFr, status, note, proposedBy, decidedBy, decidedAt, createdAt,
                       storeName?, live?: { returnsPolicy, returnsPolicyFr, shippingPolicy, shippingPolicyFr } }   // `live` = the text on the store now, both languages (admin list rows)
```

### 5.2 Seller

- `sellers:update` with `returnsPolicy`, `returnsPolicyFr`, `shippingPolicy`, `shippingPolicyFr` no longer writes the live text. It creates (or updates) the pending revision and the ack is the profile
  as before **plus `policyRevision: PolicyRevisionView | null`** (null when the body had no policy). Validation is unchanged (10-2000 chars; `''`/`null` clears).
  The vacation and handling-time fields in the same request are still live at once. Pushes `seller:policy` (the revision) to the owner; `policy:pending` to admin/moderation.
- **`sellers:policy:mine`** `{}` -> `{ pending: PolicyRevisionView | null, lastDecided: PolicyRevisionView | null }` (permission `storefront`, read-only). Show "Waiting for approval" and the admin's `note` of a rejection.
- **`sellers:policy:template`** `{}` -> `{ returnsPolicy: { en, fr }, returnWindowDays }` (permission `storefront`). A ready returns policy in both languages, with the platform's return window filled in; the seller edits and submits it.

### 5.3 Admin (roles `admin`, `admin_moderation`; group `storePolicy`; everyone else "Not allowed.")

| event | payload | ack data / effect |
|---|---|---|
| `sellers:policy:list` | `{ status?: 'pending'(default)\|'approved'\|'rejected'\|'all', sellerId?, limit? (<= 200), offset? }` | `PolicyRevisionView[]` newest first, each with `storeName` and `live` |
| `sellers:policy:approve` | `{ id, note? }` | the proposal is copied into the live fields and translated exactly like the live write used to be (author rows, machine translation queued, `seller:updated` to the owner and admins); returns the revision (`approved`). A failing live write puts it back to `pending`. Notice to the seller |
| `sellers:policy:reject` | `{ id, note }` (note >= 5 chars, shown to the seller) | live text untouched; revision `rejected`. Notice to the seller |
| `sellers:policy:publish` | `{ sellerId, returnsPolicy?, returnsPolicyFr?, shippingPolicy?, shippingPolicyFr?, revisionId?, note? }` | edit-and-publish ANY store's policy: goes live now, recorded as an approved revision by the admin. `revisionId` = the pending proposal the admin edited (it becomes approved); any other pending revision of the store is closed as rejected ("Replaced: KOMORIKO published the store policy directly."). Notice to the seller |

Decided twice -> `This policy change was already decided.`; unknown id -> `Policy change not found.`; nothing to publish -> `Nothing to publish: write at least one policy.`
All four are audited (`seller.policy_approved|rejected|published`). Pushes: `policy:pending` (new proposal) and `policy:decided` (any decision) to the `storePolicy` roles; `seller:policy` to the owner.

### 5.4 Notices (type `policy`)

| title | recipient | body | French title | French body |
|---|---|---|---|---|
| `Store policy awaiting approval` | role `admin_moderation` (and the super admin) | `<store>: new returns or shipping policy to review.` | Politique de boutique à approuver | `<store> : nouvelle politique de retour ou d’expédition à examiner.` |
| `Store policy approved` | the store owner | `Your returns and shipping policy is now live on your store[: <note>].` | Politique de boutique approuvée | Votre politique de retour et d’expédition est maintenant en ligne sur votre boutique[ : <note>]. |
| `Store policy rejected` | the store owner | `Your policy change was not approved: <note>` | Politique de boutique refusée | Votre modification de politique n’a pas été approuvée : <note> |
| `Store policy updated` | the store owner (admin published) | `KOMORIKO updated the policy shown on your store[: <note>].` | Politique de boutique mise à jour | KOMORIKO a mis à jour la politique affichée sur votre boutique[ : <note>]. |

The note is quoted in each reader's language (translated before it is stored). Link: seller `/seller/storefront`; admin currently `/admin/sellers/<storeId>` (B1: point it at the policy queue page and update `notifications/links.ts`).

---

## 6. "Support response time"

`sellerResponseHours` keeps its key and its meaning of "hours", but it is now **support's** response time (returns, disputes, exchanges, replacements).
Server texts: the settings validator label is **"Support response time"** (message: `Support response time must be a number between 0.001 and 720.`; the French label is "Le délai de réponse du support"),
the alert notices above. Web/app labels (admin settings, customer and seller portals) are Phase B.

---

## 7. Seller permissions and notices (`sellers/seller-permissions.ts`)

- `permissionForEvent`: `exchange`, `replacement`, `dispute` heads are gone (personal: not shared with team members).
- `permissionForNotice`: `return`, `dispute`, `exchange`, `replacement`, `chat` are now **owner-only** (`team`): they are about the owner's own shopping. `policy` -> `storefront`.
- `orders` permission no longer covers returns/disputes/replacements/exchanges; `support` no longer covers customer chat. `storefront` covers policy proposals; express is not a seller permission.
- Notice links (`notifications/links.ts`): a seller's `return|dispute|exchange|replacement|chat` notices open `/seller/notifications`; customer `chat` opens `/shop/notifications`; `policy` as above.

---

## 8. New and changed errors (English -> French; add to the web `api-errors` map and the app error maps)

| English | French |
|---|---|
| Messaging sellers is closed. Contact support from your account. | La messagerie avec les vendeurs est fermée. Contactez le support depuis votre compte. |
| Returns are decided by KOMORIKO support. | Les retours sont décidés par le support KOMORIKO. |
| Your request is already with KOMORIKO support. | Votre demande est déjà entre les mains du support KOMORIKO. |
| Not enough stock to send a replacement. Ask the seller to restock the item, or reject the request. | Stock insuffisant pour envoyer un remplacement. Demandez au vendeur de réapprovisionner l’article, ou refusez la demande. |
| Not enough stock for this exchange. Ask the seller to restock the item, or reject the request. | Stock insuffisant pour cet échange. Demandez au vendeur de réapprovisionner l’article, ou refusez la demande. |
| This store has no pinned pickup location. Ask the seller to pin it in Store settings before turning on express delivery. | Cette boutique n’a pas de lieu de collecte placé sur la carte. Demandez au vendeur de le placer dans les paramètres de la boutique avant d’activer la livraison express. |
| Policy change not found. | Modification de politique introuvable. |
| This policy change was already decided. | Cette modification de politique a déjà été traitée. |
| Tell the seller why the policy was not approved. | Expliquez au vendeur pourquoi la politique n’a pas été approuvée. |
| Nothing to publish: write at least one policy. | Rien à publier : rédigez au moins une politique. |
| Status must be pending, approved, rejected or all. | Le statut doit être en attente, approuvé, refusé ou tous. |
| Support response time (validator label) | Le délai de réponse du support |

Retired from the server (no longer produced; old clients may still list them): `Only returns need an accept or reject; reply to the customer instead.`, `The response time has passed; KOMORIKO support decides now.`,
`Wait for the seller to answer, or for the response time to pass.`, `Tell the customer why you are rejecting this return.`, `Only operations can approve an exchange that refunds money to the customer's wallet.`,
`Pin your pickup location on the map (Store settings) before offering express delivery.`, the two older "Restock the item or reject the request." stock errors.
Still used: `Express delivery must be true or false.`, `Store not found.`, `Conversation not found.`, `Not allowed.`.

---

## 9. Role groups

`api/src/common/role-groups.ts`: new `storePolicy: ['admin', 'admin_moderation']`. Existing groups used: `logisticsDesk` (express), `support` (chat read), `disputeDesk` (returns/disputes), `exchangeDecide` (exchanges/replacements). The web `admin-access.ts` must mirror them:
Moderation gets "Store policies"; Operations gets the express toggle on the store page; Support/admin get "Chats (read-only)".

---

## 10. What an old client sees (keep old builds working)

- Old customer app: `disputes:escalate` and `returns:respond` answer with a clear refusal; `canEscalate` is false so the button is hidden; `chat:start` / `chat:send` show the closed message; `chat:list` still shows history.
- Old seller portal: returns/disputes/replacements/exchanges lists are empty; `returns:respond` and `replacements|exchanges:respond` are refused; `chat:list` is empty; `sellers:update` still saves vacation / handling time, ignores express, and its policy fields become a pending revision (the old UI shows the old live text until approval).
- A request with a legacy stage name parses (it is in the stage type) but the migration leaves none open.

---

## 11. Data model and migrations

1. `1793480000001-AwaitingSupport`: open requests in `awaiting_seller | seller_rejected | seller_timeout | seller_replied` -> `awaiting_support`; `seller_rejected` / `seller_timeout` rows are marked "support was told" (`sellerLapsedAt`) so the first SLA sweep does not alert for every old case; MySQL column default `awaiting_support`. Down: back to `awaiting_seller`.
2. `1793480000002-SellerPolicyRevisions`: the table of §5.1 and the grandfathering. Down: drops the table (live text on the stores is untouched).

## 12. Tests

Jest: `disputes.service.spec`, `disputes-i18n.spec`, `after-sale/gateways.spec`, `flows/*` (replacements-exchanges, exchange-money-roles, seller-lapse, after-sale-notes-i18n), `chat/*`, `sellers/policy.service.spec` (incl. both migrations), `sellers/admin-controls.gateway.spec`, `sellers/storefront.spec`, `sellers/seller-permissions.spec`, notice coverage and links specs.
Smokes (`api/test`): `after-sale-smoke`, `r2f-smoke`, `seller-platform-smoke`, `delivery-express-smoke`, `authz-smoke`, `flows-smoke`, `i18n-smoke`, `demo-seed-check`.
Demo seed: the demo support agent approves/answers returns, disputes, exchanges and replacements; store A's policy is published (approved); store B has a **pending** policy proposal; store C's express is set with `sellers:setExpress`; the three demo chats are history.
