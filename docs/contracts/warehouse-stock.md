# Warehouse stock ledger (WS-C)

Bins, on-hand per SKU and bin, receiving, moves, cycle counts, stock-outs and the history, per warehouse. It sits **on top of** parcel
custody (`docs/contracts/logistics.md`): parcels still move only through `delivery_tasks`; the ledger records where the goods
sit in the building while they are there. It changes nothing in `delivery_tasks`, in `stock_movements` (the seller's catalogue
stock, `inventory:*`) or in `warehouse:inventory` (parcels in custody).

Code: `api/src/inventory/warehouse-stock.{service,gateway,module}.ts`, entities `warehouse_bins`, `warehouse_stock`,
`warehouse_ledger`, migration `1793200000003-WarehouseStockLedger` (QueryRunner table API: MySQL and SQLite).

## Data model

| Table | One row is | Key |
|---|---|---|
| `warehouse_bins` | a shelf / rack / floor spot: `hubId`, `code` (upper-case, as printed), `label`, `active` | unique `(hubId, code)`; `RECV` = the receiving area, created on first use |
| `warehouse_stock` | units of one product option in one bin: `hubId, binId, productId, variant, qty` | unique `(hubId, binId, productId, variant)`; `CHECK (qty >= 0)` |
| `warehouse_ledger` | one movement: `kind` (`receive`, `move`, `count`, `stock_out`), `reason`, `qty`, `delta`, `onHandAfter`, `fromBinId/Code`, `toBinId/Code`, `expectedQty/countedQty` (counts), `taskId`, `orderId`, `actorId/Name`, `note`, `clientRef`, `createdAt` | never edited or deleted; unique `clientRef` (when set) |

`variant` is the product option label, `'Default'` when the product has none (same convention as `stock_movements`). `delta` is the
effect on the warehouse's total of that option (+ in, - out, 0 for a move, counted - expected for a count). **`warehouse_stock` is the
running total of `warehouse_ledger`** (a jest property test replays the ledger and compares). SKU label = `SKU-` + first 6 characters of the product id (what the desk
already shows).

Rules, each enforced in the service and again by the database where it can:
- Never below zero: every decrease is one conditional `UPDATE ... WHERE qty >= n`; two people taking the last units cannot both win. `CHECK (qty >= 0)` backs it.
- Every change writes its ledger line in the same transaction (MySQL: read-committed; SQLite: transactions take turns).
- A parcel can be put away only once it was scanned in at this warehouse (`status = delivered` on a hub-bound leg whose `toHubId` is the warehouse) and only up to what it carries, minus what was already put away from it.
- A request with `clientRef` is recorded once, however often it is sent. Multi-line requests use `ref:0`, `ref:1`, ...
- **Dispatch stocks out automatically**: when a leg leaving a warehouse becomes `picked_up` (hand-over at the desk, transfer run dispatch, rider pick-up), what that *order* had put away at that warehouse and has not left yet is taken from the bins that hold it (a delivery takes everything of the order; a transfer / return leg only the products it carries). Only what is on the shelves, never below zero, never blocks or fails the dispatch, once per task (`reason: dispatch`, `taskId`, `orderId`). Implemented as a `LogisticsService.registerListener`, no change inside the logistics service.
- A count with a variance is also written to the audit log (`stock.count`).

## Who may do what

| Action | Warehouse staff | Admin |
|---|---|---|
| read (`stock:bins`, `stock:onHand`, `stock:history`, `stock:lookup`, `stock:parcel`) | any tier, own warehouse only | any admin role; `hubId` optional |
| `stock:receive`, `stock:receiveParcel`, `stock:move`, `stock:out` | any tier (operator and up), own warehouse | `admin`, `admin_operations`; `hubId` required |
| `stock:count`, `stock:binCreate`, `stock:binUpdate` | supervisor and manager | `admin`, `admin_operations`; `hubId` required |

Staff always act on their own warehouse: a `hubId` they send is ignored. Riders, customers, sellers and guests: refused.

## Socket events (all answer `{ ok, data | error }`)

- `stock:bins {hubId?}` -> `[{ id, hubId, code, label, active, units, skus }]`
- `stock:binCreate {hubId?, code, label?}` -> bin. `stock:binUpdate {hubId?, binId, label?, active?}` (a bin that holds stock, and `RECV`, cannot be switched off)
- `stock:onHand {hubId?, search?, binId?, productId?, limit?, offset?}` -> `{ total, units, rows: [{ hubId, productId, variant, sku, name, nameFr, onHand, bins: [{ binId, code, qty }] }] }`
- `stock:history {hubId?, productId?, variant?, binId?, kind?, orderId?, limit?, offset?}` -> ledger lines newest first, each with `sku`, `name`, `nameFr`
- `stock:lookup {hubId?, code}` -> `{ bin | null, products: [{ productId, sku, name, nameFr, variants[] }] }` (a scanned bin label, SKU label, id prefix or name)
- `stock:parcel {hubId?, taskId}` -> `{ taskId, orderReference, kind, status, atHub, canReceive, lines: [{ productId, variant, sku, name, nameFr, qty, stocked, remaining }] }`
- `stock:receiveParcel {hubId?, taskId, binId?|binCode?, lines?: [{ productId, variant?, qty }], note?, clientRef?}` -> `{ taskId, lines: [ledger] }` (all lines or none; no bin = the receiving area)
- `stock:receive {hubId?, productId, variant?, qty, binId?|binCode?, reason?: manual_receipt|return_restock|other, note?, clientRef?}` -> ledger line
- `stock:move {hubId?, productId, variant?, qty, fromBinId?|fromBinCode?, toBinId?|toBinCode?, note?, clientRef?}` -> ledger line
- `stock:out {hubId?, productId, variant?, qty, binId?|binCode?, reason: damaged|lost|sample|seller_pickup|other, note?, clientRef?}` -> ledger line (`other` needs a note)
- `stock:count {hubId?, binId?|binCode?, lines: [{ productId, variant?, counted, expected? }], note?, clientRef?}` -> `{ binId, binCode, lines: [{ productId, variant, expected, counted, variance, ledgerId }], totalVariance }`. `expected` is what the counter saw; if the bin changed since, the count is refused (`... changed while you were counting (now N). Refresh and count again.`). Products not on the sheet are untouched.

Push: `stock:updated { hubId, productIds }` to the warehouse room and the admin roles after every change.

## Errors (English text -> French in `web/src/lib/api-errors.ts`)

`Bin A-01 holds only 5 of Phone case: you cannot take 6.` · `Bin B-02 holds no Phone case.` · `That bin does not exist in this warehouse. Ask a supervisor to create it.` ·
`Scan the parcel in before putting it away.` · `This parcel carries 2 more of Phone case: you cannot put away 3.` · `Everything on this parcel is already in stock.` ·
`Choose a warehouse first.` · `Only operations administrators and warehouse staff can change warehouse stock.` · `Only supervisors and managers can do this.` · and the rest listed in that file.

## Web

`/warehouse/inventory` (and `/admin/fulfillment/inventory`): tabs On hand · Receive · Move / out · Count · History · Bins · In custody (the
old read-only parcels-in-custody view). `/inventory/[sku]`: overview, by bin, history of that SKU.

Camera scanning (`web/src/components/warehouse/camera-scanner.tsx`, `@zxing/browser` 0.1.5 + `@zxing/library` 0.21.3, loaded on first use): the desk scan field
(`ScanInput`: hub desk, transfer runs, run receiving) and every product / bin field have a camera button. It uses the back camera, reads Code 128 / 39, EAN, UPC, ITF,
QR and Data Matrix, stays open for the next code, and ignores a code it just read for ~2 s. It needs a secure page (https or localhost);
when the camera cannot start (no https, permission refused, no camera, camera busy) the panel says why in the user's language and keeps a typed field, and the
page's own fields keep working with USB / Bluetooth keyboard-wedge scanners. Codes: parcel `PKG-AB12CD` / `BC-AB12CD`, product `SKU-ab12cd`, bin `BIN-A-01` or the plain code.
