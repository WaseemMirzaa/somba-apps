# Logistics contract — warehouse routing, three legs, warehouse desk

> **Update (warehouses by area).** Routing is no longer "nearest warehouse by distance": the destination and origin warehouses are
> the ones that **cover** the customer's / the seller's **area**, and legs may chain over several warehouses (lanes, hops, transfer
> runs). Where this file says "nearest", read `docs/contracts/areas.md` (binding): §1 destination / origin, §2 fee, §3 quote
> (`fallback` now means "the covering warehouse has no rider"), §4 hub directory (`areaId`, coverage), §11 seed (two Kinshasa
> warehouses, no Paris / Lubumbashi, no `*.paris@` accounts). The three-leg model, the desk, tiers, scan-in rules and all task
> payloads below are unchanged except for the fields areas.md adds (`finalHubId`, `hop`, `hops`, `runId`, `runReference`).

Owner: the logistics API builder. Web, app and after-sale builders code against this file. Companion to
`docs/WAREHOUSE-SELLER-FLOWS-PLAN.md` §6–§7 (which this implements) and `docs/MULTILINGUAL-PLAN.md` §2.5.

All events are Socket.IO events on the one socket every client already opens (JWT in the handshake). Every request
gets the standard ack `{ ok: true, data }` or `{ ok: false, error }`. Error strings are stable English texts; clients map
them to French by exact match (see "Errors" at the end for the new ones).

## 1. The model in one picture

```
order:   seller --pickup--> ORIGIN hub --transfer--> DESTINATION hub --delivery--> customer
return:  customer --return_pickup--> DESTINATION hub --return_transfer--> ORIGIN hub --return_to_seller--> seller
replace: seller --pickup--> ORIGIN hub --transfer--> DESTINATION hub --replacement_delivery--> customer
```

- **Destination hub** = the active hub that covers the customer's delivery area (the most specific covered area on the way up: commune → district → city → province). If that hub has no active rider, the nearest staffed hub of the same city, then of the same province, delivers instead (`fallback`). See areas.md.
- **Origin hub** (one per seller) = the same rule for the seller's pickup area (`sellers.pickupAreaId`, derived from the pickup pin or
  given; `sellers.originHubId` stores the covering warehouse for display). A seller with no known area sends to the destination hub
  (no transfer); a seller whose area is not served cannot be ordered from.
- If origin = destination there is **no transfer leg**.
- Zones are gone. `zoneId` columns stay (nullable, history only). The API ignores `zoneId` and `deliveryFeeUsd` sent by
  old builds. `deliveryZones` stays readable in settings but is not writable and not used.
- Riders and warehouse staff **always** belong to one hub (`users.hubId`). A rider sees only the tasks assigned to them;
  there is no self-accept and no open pool.
- A leg that **ends at a hub** (`pickup`, `transfer`, `return_pickup`, `return_transfer`) is finished by hub staff
  scanning it in: "delivered" = scanned in. A leg that ends at a customer or a seller (`delivery`,
  `replacement_delivery`, `return_to_seller`) is finished by the rider with `delivery:updateStatus`.

## 2. Settings (public: every client may read them; admin writes with `settings:set {key, value}`)

| key | meaning | validation | default |
|---|---|---|---|
| `deliveryBaseUsd` | base fee | 0–100 | 2 |
| `deliveryPerKmUsd` | fee per km (destination hub -> customer pin) | 0–50 | 0.5 |
| `deliveryMaxUsd` | cap on base + distance part | 0–500 | 15 |
| `deliveryTransferUsd` | added when any parcel travels origin hub -> destination hub | 0–100 | 1.5 |
| `requirePinnedAddress` | `'true'` = `orders:create` refuses an address with no map pin ("Pin your delivery address on the map.") | true/false | false (prod bootstrap: true) |
| `requireSellerPickupPin` | `'true'` = a seller cannot list a new product until the store has a pickup pin | true/false | false (prod bootstrap: true) |

Fee = `min(max, base + perKm × km) + transfer fees`, rounded to cents (km from the delivering warehouse to the pin; 0 with no pin). A flat per-area `feeOverrideUsd` replaces `base + perKm × km`; the transfer fee is charged per hop (a lane may set its own price; with no lanes it is the single `deliveryTransferUsd`). See areas.md "Fee and estimate".
`deliveryZones` is still in the public view for old clients; ignore it.

## 3. Quote

`delivery:quote { addressId?, geo?: {lat, lng}, city?, lines?: [{productId, qty}] }`  (any connected client, guests included)

- `addressId` = one of the caller's saved addresses (its `geo` pin and `city` are used); or send `geo` (+ `city`).
- `lines` are the cart lines (only their sellers matter, for the origin hubs).

Ack data:

```
{ feeUsd, deliveryUsd, transferUsd, distanceKm,
  destinationHubId, destinationHub: {id, name, city},
  originHubIds: string[],          // one per seller, in the order sellers first appear in lines (see `originBySeller` on the order: orders store the map)
  transfer: boolean,               // is any origin != destination
  pinned: boolean,                 // false = no pin: routed by city (fallback)
  fallback: null | 'city' | 'nearest' | 'no_riders' }   // areas.md: 'city' / 'nearest' = the covering hub has no rider; no pin is just pinned:false
```

`orders:create` computes the same route from the order's `shippingAddress` (JSON string; the pin is `geo: {lat,lng}`
or top-level `lat`/`lng`) and charges exactly `feeUsd`. Order fields added: `destinationHubId`, `originHubIds` (string[]).
`order.deliveryFeeUsd` is the quoted fee. If the route used a fallback, admins and that hub's staff get a notice.
A client that has no pin must not let the customer check out (set `requirePinnedAddress` in production).

## 4. Hub directory

| event | who | payload | ack data |
|---|---|---|---|
| `hubs:list` | any signed-in | `{activeOnly?}` | ops (admin\*, warehouse_staff): `Hub[]` = `{id, name, city, country, address, capacity, active, lat, lng, activeRiders, staffCount, placed}`; others: `{id,name,city,country,lat,lng,active}` |
| `hubs:create` | `admin`, `admin_operations` | `{name, city, country?, address?, capacity?, lat, lng}` (lat+lng required) | `Hub` |
| `hubs:update` | admins; a **manager** of that hub (name/address/capacity/position, not `active`) | `{id, ...fields, active?}` | `HubView` |
| `hubs:setActive` | admins | `{id, active}` | `Hub` (cannot switch off the last active hub) |
| `hubs:people` | manager of the hub / admins (`hubId`) | `{hubId?}` | `[{id,name,email,phone,role,active,hubId,warehouseTier}]` |
| `hubs:setTier` | manager (same hub, not self, not to `manager`) / admins | `{userId, tier}` | `{id, warehouseTier}` |

`lat`/`lng` are validated together (−90..90, −180..180). `warehouse:hubs`, `warehouse:saveHub` and
`warehouse:setHubActive` still work and use the same code (so they also accept `lat`, `lng`). Push: `hub:updated`.
Changing a hub's position or active flag recomputes every pinned seller's `originHubId`.

## 5. People

- `users.hubId` is **required** for `rider` and `warehouse_staff`.
  `roles:createStaff {email, name, role, phone?, hubId, warehouseTier?}` — `hubId` mandatory for those roles;
  `warehouseTier` ∈ `operator | supervisor | manager`, default `operator`. Ack adds `hubId`, `warehouseTier`.
  `roles:setHub {userId, hubId}` — `hubId: null` is refused; `preferredZones` is gone.
  `roles:setRole {id, role, hubId?}` — turning someone into a rider / staff needs a `hubId` (given or already set).
  `roles:staff` rows: `{id,name,email,phone,role,active,hubId,warehouseTier}` (no `preferredZones`).
- `me:get` / `ready.user` (public user): `hubId`, `warehouseTier` (null unless `warehouse_staff`); `preferredZones` removed.
- **Tiers** (enforced on the API): `operator` scans parcels in/out; `supervisor` also assigns riders; `manager` also
  manages the hub (hub settings, staff tiers). Admins can do everything. Existing staff were migrated to `manager`;
  new staff default to `operator`.
- `rider:assignment` → `{ hub: {id,name,city,address,lat,lng} | null }` (zones removed).
- Sellers: `sellers:update {…, pickupLat?, pickupLng?}` (both or `null` both to clear; validated) recomputes
  `originHubId`. `pickupLat`, `pickupLng`, `originHubId` are part of the seller's own / admin view and never public.

## 6. Delivery task (the leg)

Table `delivery_tasks`, new columns: `kind`, `fromHubId`, `toHubId`, `sellerId`, `parentTaskId`, `disputeId`,
`replacementId`, `exchangeId`, `itemsJson`. `hubId` = the **managing hub** (its staff assign the rider).

| kind | from → to | managing hub (`hubId`) | rider hubs allowed | finished by |
|---|---|---|---|---|
| `pickup` | seller → origin hub (`toHubId`) | origin | origin | **scan-in** at origin |
| `transfer` | origin (`fromHubId`) → destination (`toHubId`) | origin | origin **or** destination | **scan-in** at destination |
| `delivery` | destination hub (`fromHubId`) → customer | destination | destination | rider (`delivered`, needs the customer's 4-digit code when `requireDeliveryCode`) |
| `return_pickup` | customer → destination hub | destination | destination | **scan-in** at destination |
| `return_transfer` | destination → origin | destination | either | **scan-in** at origin |
| `return_to_seller` | hub → seller | that hub | that hub | rider (`delivered`) |
| `replacement_delivery` | destination hub → customer (also collects the old unit: `collectOld`) | destination | destination | rider (`delivered`, no code) |

Status per leg: `unassigned → assigned → picked_up → in_transit → delivered | failed`.

- Rider moves (`delivery:updateStatus {taskId, status, reason?, code?}`): `assigned → picked_up|failed`,
  `picked_up → in_transit|failed`, `in_transit → delivered|failed`; **`delivered` is refused on hub-bound legs**
  (staff scan them in). A failed leg is re-opened as a new task (`attempts + 1`); after `DELIVERY_MAX_ATTEMPTS`
  (3) a `pickup`/`delivery` of an order cancels + refunds the order; `transfer` and return/replacement legs raise a
  "Task needs attention" notice to admins and hub staff instead. After a failed `pickup` or `delivery` attempt the order
  goes back to `confirmed` (the customer may still cancel; they are told "Delivery attempt failed") and the re-opened leg
  moves it forward again.
- Staff "scan out" (`logistics:scanOut`): `assigned → picked_up` on legs that leave their hub.
- Task fields in every payload (`TaskView`): `id, orderId, orderReference, kind, status, riderId, riderName, hubId,
  fromHubId, toHubId, sellerId, sellerName, parentTaskId, disputeId, replacementId, exchangeId, attempts, codAmountUsd,
  address, pickupAddress, lat, lng, failureReason, readyAt, receivedAt, pickedUpAt, deliveredAt, createdAt, updatedAt,
  from, to, fromHub, toHub, items, collectOld, needsCode, orderFlow`.
  `from` / `to` / `fromHub` / `toHub` are endpoints `{type: 'seller'|'hub'|'customer', id, name, address, lat, lng, city?, phone?}` ready to draw on a map.
  `items` = what the leg carries (`[{name, qty, ...}]`). `orderFlow` = the leg belongs to the order's own journey.
  **The handover code is never in a payload** (only the customer sees it: `orders:deliveryCode`).
- Legacy open tasks (created before this release) became `kind: 'delivery'` and keep working.

### Customer-facing order status

`confirmed → processing → shipped → out_for_delivery → delivered`, moving forward only:
- first pickup assigned → `processing`
- **every** pickup scanned in (all parcels at their origin hubs) → `shipped` (customer notice "Parcel at our warehouse")
- delivery picked up → `shipped` (no change); delivery in transit → `out_for_delivery`; delivery delivered → `delivered`
- `order.riderId` is set when the **delivery** leg is assigned (the customer sees that rider's name/phone while
  `shipped`/`out_for_delivery`); pickup and transfer riders are never shown to the customer.
- Seller "ready" (`orders:sellerReady`) marks the seller's lines `ready` and the seller's pickup task `readyAt`; it no longer
  waits for the other sellers. `orders:sellerCancel` that removes all of a seller's lines voids their legs; the
  delivery leg starts once the remaining parcels are at the destination.
- Seller line `fulfilment`: `open → ready → received` (received = their pickup scanned in at the hub).

## 7. Warehouse desk (staff, new gateway `logistics.gateway.ts`)

The caller's hub and tier are read from the database on every call. Staff without a hub get
"Your account is not linked to a warehouse. Ask an administrator." Admins pass `hubId` where a hub is needed.

| event | who | payload | ack data |
|---|---|---|---|
| `logistics:queue` | staff / admins | `{hubId? (admins), kind?, status? ('open' default, 'all', or one status), limit?, offset?}` | `{ hubId, tasks: (TaskView & {desk:{assign,scanIn,scanOut}})[], counts: {byKind, byStatus} }` — tasks the hub **manages, sends or receives** |
| `logistics:riders` | staff / admins | `{taskId}` | `[{id,name,phone,hubId,activeTasks}]` riders that may run the task |
| `logistics:assign` | **supervisor+**, admins | `{taskId, riderId}` | `TaskView & {desk}` — task must be managed by my hub; rider active and from an allowed hub |
| `logistics:scanIn` | any staff of the task's **to-hub**, admins | `{taskId}` | `{ task: TaskView, next: TaskView[] }` — `next` = legs created by the scan. **Only after a rider collected the parcel** (`picked_up` or `in_transit`); an `unassigned`/`assigned` leg is refused with `A rider must collect this parcel before it can be scanned in.` and `desk.scanIn` is false for it |
| `logistics:dispatchTransfer` (alias `logistics:scanOut`) | any staff of the task's **from-hub**, admins | `{taskId}` | `TaskView` — hands an assigned parcel to its rider (`picked_up`) |
| `logistics:custody` | staff / admins (`hubId`) | `{hubId?}` | `{ hubId, inbound: TaskView[], onHand: (TaskView & {since, waitingFor})[], outbound: TaskView[], counts }` |

`onHand.waitingFor` ∈ `other_parcels` (waiting for the order's other parcels), `next_leg`, or `<kind>:<status>` of the next leg.
Old events keep working with the same rules: `delivery:assign {taskId, riderId}` = `logistics:assign`;
`warehouse:receive {taskId}` = `logistics:scanIn` (returns the scanned task);
`warehouse:buildBatch {taskIds, riderId}` assigns several tasks to one rider (supervisor+, all-or-nothing);
`delivery:list`, `delivery:unassigned`, `warehouse:parcels|aged|batches|reconcile|riders`, `analytics:warehouse` are
**scoped to the staff member's hub** (admins see all, or one with `hubId`). `delivery:list` rows are raw tasks.

### Pushes

`task:updated` (payload `TaskView`) — also sent as `delivery:updated` with the same payload for older clients — to:
the **hub room** of `hubId`, `fromHubId` and `toHubId` (staff join `hub:<id>` on connect), the admin roles, the assigned
rider, and (for `pickup`, `transfer`, `return_transfer`, `return_to_seller` legs) the seller's user in a redacted view
(no customer address, no COD, rider first name only). The customer follows the **order** (`order:updated`).
`delivery:location {taskId, orderId, kind, lat, lng}` goes to the customer (customer legs only), the hubs and admins.
`hub:updated`, `batch:updated` (hub room + admins). `notification:new` as always.

### Analytics (`analytics:warehouse {hubId?}`)

Staff get their own hub's figures; admins all, or one hub with `hubId`. Fields kept: `totalParcels` (every leg), `unassigned`,
`inTransit`, `codToCollect`, `byStatus` (every leg), `throughput` (`received` counts scan-ins; `delivered` / `pickedUp` count
customer deliveries), `agedOver24h`. `delivered`, `delivered30`, `failed30`, `failureRatePct` and
`avgPickupToDeliveryMinutes` now describe **customer deliveries** (`kind: 'delivery'`). New: `byKind` (open legs per kind).
`byZone` is gone; `byHub` = `[{hubId, hub, parcels, delivered, failed, batches30}]` (parcels = legs managed by that hub, 30 days;
a staff member's list holds their own hub only).

### Rider

- `rider:tasks` → only tasks **assigned to me**, newest first: `TaskView`-like rows plus `order` (`reference,
  customerName, paymentMethod, estimatedDeliveryDate, totalUsd, shippingAddress, items`). On legs that do not meet the
  customer (pickup, transfer, return_to_seller) `shippingAddress` is null and the name is the first name only.
- `delivery:accept` → `{ok:false, error:"Your warehouse assigns your tasks. You cannot accept a task yourself."}`.
- `delivery:unassigned` for a rider → `[]`.
- `delivery:list` (rider) = my tasks. `rider:earnings` counts every delivered leg.

## 8. Calling logistics from other modules (after-sale)

`LogisticsService` (`api/src/logistics/logistics.service.ts`, import `LogisticsModule`). Nobody else writes delivery tasks.

```ts
planOrder(order): Promise<DeliveryTask[]>                       // pickup tasks (idempotent); called when the order is paid / COD
onScanIn(taskId, hubId, actor?): Promise<{ task, next: DeliveryTask[] }>
createReturnPickup({ disputeId, orderId, items?: [{orderItemId? | productId?, qty?}] }): Promise<DeliveryTask>
createReplacementDelivery({ replacementId? | exchangeId?, orderId }): Promise<DeliveryTask>   // returns the FIRST leg (a pickup)
registerListener(fn: ({type, task}) => void | Promise<void>)
```

- `createReturnPickup` → one `return_pickup` task (customer → destination hub) carrying `disputeId`. When staff scan it in,
  logistics creates one `return_to_seller` (same hub) or `return_transfer` → `return_to_seller` per seller of the items.
  Idempotent per `disputeId`. `items` default to every live line. Refuses with
  "This order has no destination warehouse." for an order that never had one.
- `createReplacementDelivery` → legs `pickup` (seller → origin hub) → `transfer` (if hubs differ) → `replacement_delivery`
  (destination hub → customer, collects the old unit). Every leg carries `replacementId` or `exchangeId`; the **last** leg
  has `kind: 'replacement_delivery'`. Idempotent per replacement / exchange. These legs never change the customer's order status.
- Listener events `type`: `created | assigned | picked_up | in_transit | scanned_in | delivered | failed | voided`, with the
  `DeliveryTask` (`kind`, `disputeId`, `replacementId`, `exchangeId` tell the case). Use them to move your own statuses:
  `return_pickup` + `scanned_in` = goods are at the warehouse; `return_to_seller` + `delivered` = back with the seller;
  `replacement_delivery` + `delivered` = replacement / exchange delivered. A listener that throws is logged, never breaks logistics.
- Pushes your module should rely on: `task:updated` (above). Filter by `disputeId` / `replacementId` / `exchangeId` / `orderId`.

## 9. Notifications added (all have French in `notifications/localize.ts`)

`Task to assign` (hub supervisors, or all staff if none), `New task assigned to you` (rider, type `task`),
`Pickup scheduled` and `Package at the warehouse` (seller), `Address without a map pin` and `No warehouse with riders`
(admins + destination hub staff), `Task needs attention` (admins + hub staff). Reused: `Rider assigned`, `Parcel at our
warehouse`, `Delivery update`, `Parcel ready for pickup`, `Seller package ready`. Removed: `New delivery available`
(riders are never offered tasks) and the batch notice "collect them at the warehouse".

## 10. Errors (English text → map to French by exact match)

- `Your warehouse assigns your tasks. You cannot accept a task yourself.`
- `A rider must collect this parcel before it can be scanned in.` (scan-in of an unassigned / assigned leg)
- `That parcel belongs to another warehouse.` (`exceptions:create` with a `taskId` of another warehouse) / `Exception not found.` (changing another warehouse's incident)
- Rider status change that is not allowed: `A <leg> that is <status> cannot become <status>.` The French mapping is by pattern, with these word keys: legs (`pickup`, `transfer`, `delivery`, `return pickup`, `return transfer`, `return to seller`, `replacement delivery`) and statuses (`unassigned`, `assigned`, `picked up`, `in transit`, `delivered`, `failed`): "Un <leg> qui est <statut> ne peut pas passer à <statut>." (e.g. `A pickup that is picked up cannot become assigned.`).
- `Your account is not linked to a warehouse. Ask an administrator.`
- `Only supervisors and managers can assign riders.`
- `Only managers can change staff tiers.` / `Only managers can see the staff list.` / `Only an administrator can make someone a manager.` / `You cannot change your own tier.` / `This person works at another warehouse.` / `Only warehouse staff have a tier.`
- `This task belongs to another warehouse.` / `This rider works at another warehouse.` / `Choose an active rider.` / `This delivery is no longer available.`
- `This parcel is not due at your warehouse.` / `This parcel was already scanned in.` / `A failed task cannot be scanned in.` / `This task is finished by the rider, not scanned in.`
- `This leg ends at the warehouse: warehouse staff scan the parcel in.` (rider tried `delivered` on a hub-bound leg)
- `This parcel does not leave from your warehouse.` / `Assign a rider before handing the parcel over.`
- `Pin your delivery address on the map.` / `Delivery is not available right now: no warehouse is open.`
- `Place the warehouse on the map: latitude and longitude are required.` / `Enter a valid latitude (-90 to 90) and longitude (-180 to 180).`
- `Enter a valid pickup location: latitude -90 to 90 and longitude -180 to 180.` / `Pin your pickup location on the map (Store settings) before listing products.`
- `Riders and warehouse staff must belong to a warehouse. Pick one from the list.` / `Pick an active warehouse from the list.`
- `This order has no destination warehouse.` / `One of the returned items is not on this order.`
- Existing: `Delivery task not found.`, `This delivery was just updated. Refresh and try again.`, `Wrong delivery code. Ask the customer for the 4-digit code shown in their app.`

## 11. Data, migration, seed

Migration `1792950000000-Logistics` (reversible): hubs `lat/lng`; sellers `pickupLat/pickupLng/originHubId`; users
`warehouseTier` (existing staff → `manager`; riders/staff without a hub → the first active hub); orders
`destinationHubId` (index) / `originHubIds`; delivery_tasks new columns + indexes, existing rows `kind='delivery'`.
Existing hubs get null coordinates (place them in Admin → Hubs; unplaced hubs are never chosen by the router).
Seed (`npm run seed`) — superseded by areas.md: Entrepôt Kinshasa (Gombe −4.3105, 15.3136, covers the province) and Entrepôt Limete (−4.3540, 15.3470, covers Mont-Amba and Tshangu). (Originally: Kinshasa Hub, Limete Hub, Lubumbashi Hub (no riders), Paris Hub (48.8566, 2.3522).) Riders: `rider@somba.app` (Kinshasa), `rider.limete@somba.app`, `rider.paris@somba.app`. Staff:
`warehouse@somba.app` = manager of Kinshasa Hub, `operator@somba.app` = operator at Kinshasa Hub,
`warehouse.limete@somba.app` = supervisor at Limete Hub, `warehouse.paris@somba.app` = manager at Paris Hub. Sellers:
`seller@somba.app` (Kinshasa Traders, pin in Gombe, origin Kinshasa Hub) and `seller2@somba.app` (Limete Wholesale, pin in
Limete, origin Limete Hub; owns every fifth demo product). The demo customer has three pinned saved addresses (Gombe — default,
Limete, Paris). Five demo orders walk the real services (one waiting, one with the pickup assigned, one out for delivery, two
delivered — one of them through a transfer). All demo passwords `Somba@2026`.
`bootstrap:prod` places the four hubs on the map (and gives known hubs without a position theirs), and turns
`requirePinnedAddress` and `requireSellerPickupPin` on.

## 12. Known limits (not changed here)

- (none for hub scoping any more: see §13)
- `users.preferredZones` and the `zoneId` columns stay in the schema (history), unused.

## 13. Integration fixes (hub scoping, customer journey, scan-in rule)

**Hub scoping (warehouse staff only ever get their own warehouse; admins get everything).** An order concerns a warehouse when it is the
order's `destinationHubId` or one of its `originHubIds` / `originBySeller` values.
- `orders:list` for `warehouse_staff` -> only those orders (newest 200, `limit` / `offset`).
- `order:created` / `order:updated` go to the admin roles and to the `hub:<id>` room of each warehouse of the order (no longer to every
  `warehouse_staff`). The same rule covers pushes from payments, disputes and logistics.
- `exceptions:list` / `exceptions:create` / `exceptions:setStatus`: an incident has a `hubId` (migration column). Staff create it for their own
  warehouse whatever `hub` name they typed (an admin names the `hub`, or the `taskId` decides); a `taskId` of another warehouse is refused; staff
  cannot read or change another warehouse's incident (`Exception not found.`). `exception:updated` goes to admins + that warehouse's staff.
- `warehouse:inventory` for staff = the products of the parcels in **their custody** (inbound, on hand, outbound; see `logistics:custody`), each row
  with `custodyQty` (units in custody) next to the seller's `stock`. Admins (optional `hubId`) keep the whole catalogue view (no `custodyQty`).

**Scan-in rule.** `logistics:scanIn` / `warehouse:receive` / `delivery:scanIn` need the leg to be `picked_up` or `in_transit` (a rider collected it).
`desk.scanIn` is true only then.

**`needsCode`** on a `TaskView` is true only for a `delivery` leg **and** only while the `requireDeliveryCode` setting is `'true'`.

**Reassignment.** When `logistics:assign` moves a task from one rider to another, the previous rider gets `task:updated` (and `delivery:updated`)
`{ id, orderId, orderReference, kind, status: 'unassigned', removed: true, reason: 'reassigned' }` (nothing about the new rider): drop it from the list.

**Customers read the journey.** Every order payload a customer receives (`orders:list`, the `orders:create` reply, `order:created`, `order:updated`) carries:
```
tracking: null | { carrier, currentLeg, riderFirstName, lastUpdateAt, legs: [{ id, kind, status, riderFirstName, readyAt, receivedAt, pickedUpAt,
                    deliveredAt, createdAt, updatedAt, attempts, failureReason, fromHub: HubName|null, toHub: HubName|null }] }
hubs: { destination: HubName|null, origins: HubName[], bySeller: { [sellerId]: HubName } }       // HubName = { id, name, city }
```
(`rider: { name, phone }` as before, while the order is shipped / out for delivery). A leg that changes pushes `order:updated` to the customer, so the
journey redraws. Customers still get no `task:updated` and no `delivery:list` (no phone, address or code of anyone else is ever in `tracking`).

**Which seller goes to which warehouse.** `originHubIds` has no line order. Orders now also store `originBySeller: { [sellerId]: hubId }` (keys =
the `sellerId` of the order lines; the raw order that admins / staff get carries it, and so does `hubs.bySeller` above). Orders placed before this
existed have `originBySeller: null`; the customer view reads them back from the pickup legs.

**Delivery estimate.** `totalDeliveryDays = min(30, deliveryDays + handlingDays)`: the TOTAL is clamped to the platform maximum of 30 days
(`DELIVERY_DAYS.max`), exactly like the order's `estimatedDeliveryDate`.

**Migration** `1792990000001-IntegrationFixes`: `warehouse_exceptions.hubId` (+ index; existing incidents are matched through their parcel, then the
hub name), `orders.originBySeller` (text, JSON), `exchanges.attachments`.
