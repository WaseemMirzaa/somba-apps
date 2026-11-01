# Warehouses by area — DRC launch, single and multi-warehouse

Status: use case and change analysis (2026-10-26). Written by Opus 5.5. To be built by Sonnet 5.5.
Replaces the "nearest warehouse by distance" rule from `WAREHOUSE-SELLER-FLOWS-PLAN.md` §6.1 with **area coverage**.
Distance is kept only as a fallback and for the delivery fee. The three legs (pickup → transfer → delivery) stay.

---

## 1. The geography (DRC)

```
Country       CD   République démocratique du Congo
└─ Province   26   e.g. CD-KN Kinshasa (city-province), CD-HK Haut-Katanga, CD-NK Nord-Kivu …
   └─ City    33 official "villes", e.g. Kinshasa, Lubumbashi, Likasi, Goma, Matadi …
      └─ District   only Kinshasa: Funa, Lukunga, Mont-Amba, Tshangu
         └─ Commune 24 in Kinshasa (Gombe, Limete, Masina, Kimbanseke, Ngaliema …)
            └─ Quartier   optional, added by admins when needed (several hundred in Kinshasa)
```

- **Kinshasa is a province and a city at the same time.** The tree is province CD-KN → city Kinshasa → 4 districts →
  24 communes. Other cities start with no sub-levels, and admins can add communes or quartiers to any city later.
- **Data source:** `api/src/database/geo/drc.json` (verified by the research step, with its sources in
  `docs/DRC-GEOGRAPHY.md`).
- **Codes:** provinces use their **ISO 3166-2:CD** code (`CD-KN`). Cities, districts, communes and quartiers get stable
  internal codes (`CD-KN-KIN`, `CD-KN-KIN-LUK`, `CD-KN-GOM` …).
- **Both languages.** Every area has a French name (official) and an English name. Google itself spells some
  provinces differently by language:

  | Language | Examples |
  |---|---|
  | French | `Nord-Kivu`, `Kongo-Central`, `Équateur` |
  | English | `North-Kivu`, `Kongo Central`, `Equator` |

  So each area stores both Google spellings (`googleName` for French, `googleNameEn` for English). Every screen shows
  the user's language, and an address geocoded in either language resolves to the same area. A French version of this
  document is `WAREHOUSE-AREAS-USE-CASE.fr.md`.
- **Names as Google writes them.** Each area keeps:
  - `name`: the official name;
  - `googleName`: the exact spelling Google Geocoding returns;
  - `aliases`: other spellings people type, used for matching.

  Matching ignores accents, case, hyphens, apostrophes and spaces.

  What Google returns for a Kinshasa address:

  | Google field | Our level | Example |
  |---|---|---|
  | `country` | country | Democratic Republic of the Congo / République démocratique du Congo |
  | `administrative_area_level_1` | province | Kinshasa |
  | `locality` | city | Kinshasa |
  | `sublocality_level_1` | commune | `Gombe`, `Limete`, `Ndjili` (not "N'djili"), `Mont Ngafula` (no hyphen), `Kimbanseke` |

  Districts never appear in Google results. A commune's district comes from our own tree.

## 2. Warehouses and the areas they cover

- **A warehouse sits in one area (its location),** usually a city or a commune. It has a map pin, an address, staff
  (operator / supervisor / manager) and **its own riders**. A rider or staff member belongs to exactly one warehouse.
- **Coverage:** the admin assigns areas to a warehouse at any level: a whole province, a city, a district, a commune or
  a quartier.
  - **One owner per area.** An area can be assigned to only one warehouse. Assigning an area another warehouse
    already owns is refused, unless the admin explicitly moves it.
  - **The most specific assignment wins.** Example: Warehouse K covers province Kinshasa, and Warehouse L covers the
    districts Mont-Amba and Tshangu. A Limete address (Mont-Amba) goes to L; a Gombe address (Lukunga) goes to K.
  - **Served or not.** An area is served when it, or one of its parents, is covered by an active warehouse.
    Unserved areas show "coming soon" and checkout is refused there ("We don't deliver to Lubumbashi yet.").
- **The same rule covers buyers and sellers:**
  - **Destination warehouse** = the warehouse covering the **customer's** delivery address.
  - **Origin warehouse** = the warehouse covering the **seller's** pickup address.
  - A seller whose pickup address is not in a served area can set up the store but cannot sell until the area is
    served.

## 3. How an address gets its area

1. **Pin first.** The customer or seller places the map pin. The app reverse-geocodes it with Google and matches
   `sublocality_level_1` → commune, `locality` → city and `administrative_area_level_1` → province, using the
   `googleName` and aliases.
2. **Confirm.** The form shows Province → City → Commune (optional quartier) filled in from the pin. The user can
   correct them; the pickers list served areas first and show unserved ones as "coming soon".
3. **Stored on the address:** `areaId` (the most specific area found), the pin, and the text fields as today
   (`commune`, `city`, `region`, `country` — written with Google's names).
4. **Old addresses** without `areaId` are matched on the server from their commune and city text, then their pin; if
   nothing matches, they fall back to their city's warehouse.

## 4. Routing rule (server)

```
area(address)  → walk up: commune → district → city → province → country
               → the first area that has a coverage row decides the warehouse
warehouse has ≥1 active rider?  yes → use it
                                 no  → nearest warehouse WITH riders in the same city, then province   (fallback, admins alerted)
no coverage at any level        → not served → checkout refused (bilingual message)
```

- **Origin** = route(seller pickup address); **destination** = route(customer address); one origin per seller in a
  multi-seller order.
- **Fee:** base + per-km from the **destination warehouse** to the customer's pin (capped), plus the transfer fee when
  an origin ≠ destination, plus an optional per-area **fee override** on a coverage row (e.g. remote Maluku). Admins
  set all of these; the quote and the order use the same calculation.
- **Cross-city / cross-province orders** (e.g. a Kinshasa seller, a Lubumbashi customer) work the same way: origin
  Kinshasa warehouse → long transfer → Lubumbashi warehouse → delivery. They are allowed when both areas are served
  and the setting `allowInterCityDelivery` is on (default on). The transfer fee can be set per pair of provinces later;
  for launch it is one transfer fee.

## 5. Use cases

### UC-1 Launch: one warehouse covers all of Kinshasa (single-warehouse mode)
- **Setup:** the admin creates "Entrepôt Kinshasa" (in commune Gombe, pinned) and assigns **province Kinshasa (CD-KN)**.
  Riders R1…Rn and staff belong to it.
- **Flow:** a customer in Masina buys from a seller in Ngaliema.
  1. Both addresses are in CD-KN, so origin = destination = Entrepôt Kinshasa. There is **no transfer leg** and no
     transfer fee.
  2. **Pickup leg:** the staff assign rider R1 → R1 collects from the seller (Ngaliema) → the warehouse scans it in.
  3. **Delivery leg:** the staff assign rider R2 (or R1 again) → out for delivery → delivered (with the code if it is
     on).
- **Everything outside Kinshasa** shows "coming soon"; checkout and seller activation are refused there.

### UC-2 A second warehouse in Kinshasa (multi-warehouse, same city)
- **Setup:** the admin creates "Entrepôt Limete" (pinned in Limete), gives it its own riders, and assigns the districts
  **Mont-Amba** and **Tshangu**. Entrepôt Kinshasa keeps the province, so it still covers Lukunga and Funa.
- **UC-2a — same warehouse:** seller in Gombe → customer in Kalamu (Funa). Both are covered by Entrepôt Kinshasa, so
  the flow is UC-1.
- **UC-2b — seller near A, customer in B's area** (the owner's case):
  - **Seller in Gombe** → origin **A = Entrepôt Kinshasa**.
  - **Customer in Masina (Tshangu)** → destination **B = Entrepôt Limete**.
  1. **Pickup:** A's staff assign **A's rider** → seller → A scans in.
  2. **Transfer A → B:** A's staff assign a rider (A's, or B's if A allows) → A hands the parcel over (scan out) → the
     rider drives to B → **B scans it in**.
  3. **Delivery:** B's staff assign **B's rider** → customer (Masina) → delivered.
  - **Customer screen:** "Picked up from the seller → At Entrepôt Kinshasa → In transfer to Entrepôt Limete → At your
    warehouse → Out for delivery (rider name, call) → Delivered".
  - **Fee:** base + km (Limete → Masina) + transfer.
- **UC-2c — reverse:** seller in Limete → customer in Gombe. Origin B, destination A, and the transfer goes B → A.

### UC-3 Multi-seller order across warehouses
- One customer in Gombe (destination A) buys from a seller in Gombe (origin A) and a seller in N'djili (origin B).
  1. **Two pickups:** A's rider collects at the Gombe seller; B's rider collects at the N'djili seller.
  2. **One transfer:** B → A, for B's package only.
  3. **One delivery leg:** A's rider delivers once **every** package is at A.

### UC-4 Return (customer → back to the seller)
- **Customer in Masina (B), seller in Gombe (A):**
  1. The seller accepts the return.
  2. **Return pickup:** B's rider collects from the customer → B scans in.
  3. **Return transfer:** B → A → A scans in.
  4. **Return to seller:** A's rider takes it to the seller.
  5. The refund is issued when the warehouse scans the goods (as built).

### UC-5 Replacement / exchange
- **New unit:** seller → origin warehouse → transfer if needed → destination → `replacement_delivery`. The rider also
  collects the old unit.
- **Old unit:** goes back to the seller through the return legs when the seller wants it back.

### UC-6 Expansion to another city (Lubumbashi)
- **Setup:** the admin creates "Entrepôt Lubumbashi" in city Lubumbashi (province Haut-Katanga) with riders, and
  assigns **city Lubumbashi**. Lubumbashi becomes served; the rest of Haut-Katanga stays "coming soon" unless the
  admin assigns the whole province.
- **Local orders** (both parties in Lubumbashi) stay inside Entrepôt Lubumbashi.
- **Kinshasa seller → Lubumbashi customer:** origin Kinshasa warehouse → transfer Kinshasa → Lubumbashi (assigned by
  the Kinshasa staff to a long-distance driver of either warehouse) → Lubumbashi delivery. The estimated delivery adds
  the inter-city transfer days (setting `interCityTransferDays`, default 3).

### UC-7 Moving coverage (rebalancing)
- The admin moves commune Matete from A to B.
  - **New orders** route to B.
  - **Orders already in progress** keep their legs; nothing is rerouted mid-journey.
  - **Sellers** in Matete get origin B for new orders; their stored origin is recomputed.

### UC-8 Warehouse without riders or paused
- **Covering warehouse has no active riders:** new orders fall back to the nearest staffed warehouse in the same city,
  then the same province, and admins and that warehouse are alerted.
- **Warehouse paused (inactive):** its areas count as unserved until reassigned or reactivated, unless a parent area
  is covered by another active warehouse (then that one takes over).

### UC-9 Address outside every served area
- **Customer:** checkout shows "We don't deliver to <area> yet" (EN/FR) and lists the served cities.
- **Seller:** the store can be prepared but stays inactive for sales, with the same message.

### UC-10 Multi-warehouse transfers (multi-hop routes over lanes)
- **Lanes.** Admins define the warehouse-to-warehouse links that trucks or drivers actually run, with a transit time:
  - Entrepôt Limete ↔ Entrepôt Kinshasa: 4 h.
  - Entrepôt Kinshasa ↔ Entrepôt Kikwit: 24 h.
  - Entrepôt Kinshasa ↔ Entrepôt Lubumbashi: 72 h.
- **Route = the shortest chain of active lanes** from the origin warehouse to the destination warehouse, by transit
  time. With no lanes configured, a direct transfer is used, which is the launch default and behaves like UC-2.
- **Example — seller in Limete (origin L), customer in Kikwit (destination W):**
  - The route is L → Kinshasa (K) → W.
  - **Pickup:** L's rider collects from the seller → L scans in.
  - **Hop 1, L → K:** a transfer rider is assigned by L → K scans in. K knows the parcel continues, so it creates the
    next hop automatically.
  - **Hop 2, K → W:** a transfer driver is assigned by K → W scans in.
  - **Delivery:** W's rider delivers to the customer.
- **Customer tracking** shows every hop: "At Entrepôt Limete → In transfer to Entrepôt Kinshasa → At Entrepôt Kinshasa
  → In transfer to Entrepôt Kikwit → At your warehouse → Out for delivery → Delivered".
- **Fee and estimate:**
  - The transfer fee is charged per hop (setting `deliveryTransferUsd`).
  - A lane can override the fee with its own cost.
  - The estimate adds the lanes' transit times.
- **No route at all** (lanes exist but none connect the two): fall back to a direct transfer and alert admins.
- **Returns and replacements** follow the same route in reverse.
- **Rerouting:** a parcel already in transit keeps its route. A lane deactivated mid-route only affects hops not yet
  created; for those the route is recomputed at the next scan-in.

### UC-11 Consolidated transfer runs (one trip, many parcels)
- At a warehouse, all transfer legs waiting to leave for the same next warehouse are grouped into a **transfer run**
  (a manifest), for example "Run TR-0042 · Entrepôt Kinshasa → Entrepôt Limete · 18 parcels".
- **Sending warehouse (supervisor+):** creates the run (auto-proposed per destination or picked by hand), assigns one
  driver, scans out the run → every parcel in it becomes `picked_up` with that driver.
- **Driver:** the rider app shows the run as one card with its parcel count and destination warehouse ("Transfer to
  Entrepôt Limete · 18 parcels") and marks it on the road (`in_transit`).
- **Receiving warehouse:** scans the run in. Every parcel arrives at once, or the staff scan parcel by parcel. Parcels
  missing at closing become an exception ("Parcel missing from run TR-0042"), with notices to both warehouses and
  admins.
- A parcel can be removed from a run before it leaves. A run can't change after dispatch, except to mark parcels
  missing.
- Runs work for multi-hop routes too (each hop's legs join the next run on that lane), and for return transfers.
- **Different driver per hop.** Each hop is its own run, assigned by that hop's sending warehouse. Driver A can carry
  warehouse 1 → 2 and driver B, chosen by warehouse 2, carries 2 → 3; driver A is never carried over to the next hop.
  For a transfer between warehouses, the sending warehouse may pick a driver from its own warehouse or from the
  receiving one.
- **Several drivers on the same lane.** When parcels don't fit one vehicle, the sending warehouse **splits** the run:
  "Split run" moves the chosen parcels into a new run on the same lane, and each run gets its own driver (TR-0042
  with driver A, TR-0043 with driver B). Each run has exactly one driver; several drivers means several runs. The
  receiving warehouse sees and receives each run separately.
- **Analytics:** runs per lane, parcels per run, transit time and missing parcels.

## 6. Admin and warehouse screens

- **Admin → Geography (new):**
  - A tree Country → Province → City → District → Commune → Quartier, with search.
  - Per area: names (official, Google, aliases, EN/FR), code, pin, served status, the warehouse covering it, and the
    number of customers, sellers and orders.
  - Admins can add quartiers or communes under any city.
- **Admin → Warehouses:**
  - Create a warehouse in a province/city/commune: name, address, map pin, capacity, active.
  - **Coverage editor:** a tree with checkboxes. Areas another warehouse owns show its name and a "Move here" action
    with a confirmation. The editor shows warnings for gaps (a commune of a served city with no owner) and for
    overlaps.
  - A coverage map with the communes' pins coloured by warehouse.
  - Riders and staff per warehouse, with tiers.
- **Single vs multi:** nothing to switch. With one warehouse covering the province, the system behaves as
  single-warehouse (no transfers). Adding warehouses with more specific coverage turns on transfers automatically.
- **Warehouse portal:**
  - Each warehouse sees only its own legs: pickups in its area, transfers it sends or receives, deliveries in its
    area, returns.
  - The custody view shows parcels coming in, on hand and going out.
- **Analytics:** orders, delivery times and failures per warehouse and per commune.

## 7. Launch seed (production bootstrap)

- **Geography:** country CD with all 26 provinces and 33 cities. Kinshasa has its 4 districts and 24 communes, with
  Google names.
- **One warehouse:** "Entrepôt Kinshasa" (Gombe, pinned) covering province CD-KN. Only Kinshasa is served.
- **Removed:** the old demo hubs (Paris, Lubumbashi without riders) are removed from bootstrap.
- **Dev/demo seed:** Entrepôt Kinshasa (province) plus Entrepôt Limete (districts Mont-Amba and Tshangu), each with
  riders and staff, so transfers can be demonstrated. The two demo sellers are pinned in Gombe and Limete, and the demo
  customer has addresses in Gombe and Masina.

## 8. Change analysis (what changes where)

| Area | Change |
|---|---|
| **DB** | New `geo_areas` (id, code unique, level, name, nameEn, googleName, aliases JSON, parentId, path, depth, lat, lng, active, sortOrder). New `hub_coverage` (id, hubId, areaId **unique**, feeOverrideUsd, createdAt). `hubs.areaId` (location). `addresses.areaId`. `sellers.pickupAreaId`. `orders.destinationAreaId`. Migration + seed from `drc.json`. Existing hubs get the area of their city; existing addresses and sellers are backfilled by matching commune/city text, then pin. |
| **API — geo** | New `geo` module: `geo:tree {rootCode?, depth?}`, `geo:children {parentId}`, `geo:search {q}`, `geo:resolve {googleComponents | text | pin}` (returns the area chain), admin `geo:create`, `geo:update`, `geo:setActive`. |
| **API — coverage** | `hubs:coverage {hubId}`, `hubs:assign {hubId, areaIds, move?}` (refuses an owned area unless `move`), `hubs:unassign`, `coverage:map` (area → hub for a subtree), `coverage:gaps {areaId}`. Area ownership is enforced in the service and by the unique index. |
| **API — routing** | `RoutingService.pickDestination` / `originFor` work by area (walk up to the first covered area). Distance becomes a fallback only (no riders). Not served → `BadRequest` "We don't deliver to {area} yet." (FR mapped). Quote returns `served`, the `destinationArea` chain, and the warehouse names. Seller activation and product listing are checked against a served pickup area. Recompute the stored origin when coverage or the seller address changes. |
| **API — addresses and sellers** | Accept and return `areaId` and the area chain; validate that the area exists; fill `commune/city/region/country` with Google names. |
| **API — analytics** | By warehouse and by commune. |
| **Web admin** | Geography page; warehouse create (with location area); coverage editor and map; staff and riders per warehouse. |
| **Web shop + seller** | Address form: pin → auto-filled Province/City/Commune pickers (served first, "coming soon" disabled); not-served message at checkout; seller pickup area on the storefront. |
| **Customer app** | Same address form (reverse geocode → area match, pickers); not-served message; tracking shows the warehouse names (already built). |
| **Rider app** | No change, apart from the warehouse name on the profile. |
| **Transfers (UC-10/11)** | New `hub_lanes` (fromHubId, toHubId, transitHours, costUsd nullable, active; unique pair) and `transfer_runs` (reference, fromHubId, toHubId, riderId, status planned→dispatched→arrived→closed, counts); `delivery_tasks.runId`, `delivery_tasks.finalHubId` (end of the chain) and the order's planned `route` (hub ids). Routing computes the hop chain (shortest transit over active lanes; direct when no lanes); scan-in at an intermediate hub creates the next hop. Desk events for lanes and runs; rider app run card; customer tracking shows every hop. |
| **Tests** | Routing specs (most specific wins, unique owner, fallbacks, not served, move coverage); smoke `warehouse-areas-smoke` covering UC-1…UC-9 on a seeded DB; existing routing smoke updated. |

## 9. Defaults taken (the owner can change any of these)

1. Area coverage replaces nearest-distance; distance is the fallback and drives the fee.
2. An area has one owner; the most specific assignment wins.
3. Unserved areas: checkout refused, sellers cannot sell yet.
4. Address area from the Google pin, confirmed with pickers.
5. Transfers between warehouses: the origin's staff assign a rider from the origin, or from the destination warehouse.
6. Inter-city orders allowed when both ends are served, with +3 days.
7. Paris and other foreign hubs are removed from launch data; the languages stay EN/FR.
