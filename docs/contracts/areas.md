# Areas contract — geography, warehouse coverage, area routing, lanes and transfer runs

Owner: API areas builder. Read with `docs/WAREHOUSE-AREAS-USE-CASE.md`, which is binding. All names below are fixed:
the web and app builders code against them in parallel. The API builder may add fields but must not rename these.
Fields marked **(API addition)** were added by the API builder to the first draft; they are additive.

All events are Socket.IO events on the one socket every client already opens (JWT in the handshake; guests may open a
read-only socket). Every request gets the standard ack `{ ok: true, data }` or `{ ok: false, error }`; error strings are
stable English texts that clients map to French by exact match (or by the patterns listed under "Errors").

## Area (served in every payload)
```ts
type AreaLevel = 'country' | 'province' | 'city' | 'district' | 'commune' | 'quartier';
interface Area {
  id: string; code: string; level: AreaLevel;
  name: string;          // official name (French)
  nameEn: string | null; // English name if different (provinces: ISO reference name, e.g. 'North Kivu', 'Equator'); show `nameEn ?? name` in English
  googleName: string;    // exact Google Geocoding spelling with language=fr (match on this)
  googleNameEn: string;  // exact Google spelling with language=en (e.g. 'North-Kivu', 'Kongo Central', 'Equator'); = googleName when the same
  aliases: string[];
  parentId: string | null;
  path: string;          // codes joined by '/', e.g. "CD/CD-KN/CD-KN-KIN/CD-KN-D-MAM/CD-KN-LMT"
  depth: number;         // by level: country 0, province 1, city 2, district 3, commune 4, quartier 5 (a city with communes but no district skips 3)
  lat: number | null; lng: number | null;
  active: boolean;       // false = hidden from pickers (admins still see it; it still routes)
  status: string | null; // (API addition) a city's status from the data: 'official' | 'decree-2013'; null elsewhere
  served: boolean;       // computed: it or an ancestor is covered by an ACTIVE warehouse
  partiallyServed: boolean; // (API addition) computed: not served itself, but something inside it is (Haut-Katanga when only the city Lubumbashi is covered)
  hubId: string | null;  // computed: the warehouse that serves it (most specific coverage), null if not served
  hubName: string | null;
  childCount: number;
}
type AreaChain = Area[];  // root (country) → most specific, e.g. [CD, Kinshasa(prov), Kinshasa(city), Mont-Amba, Limete]
```
Codes: provinces use ISO 3166-2:CD (`CD-KN`); cities `CD-<province suffix>-<3 letters>` (`CD-KN-KIN`, `CD-HK-LUB`); Kinshasa's
districts `CD-KN-D-FUN|LUK|MAM|TSH`; communes `CD-KN-<3 letters>` (`CD-KN-GOM`; the commune named Kinshasa is `CD-KN-KNS`).
The data is `api/src/database/geo/drc.json` + `google-names.json`: 1 country, 26 provinces, **38 cities**, 4 districts, 24 communes.

## Both languages (binding)
- Every area has a French and an English display name: `name` (FR, official) and `nameEn` (EN; falls back to `name`).
  Clients show `nameEn` when the UI is English and `name` when French. Most communes are the same in both; provinces
  and some cities differ (Nord-Kivu / North Kivu, Équateur / Equator, Kongo Central / Central Kongo).
- Matching (`geo:resolve`, `geo:search`, address resolution) accepts `name`, `nameEn`, `googleName`, `googleNameEn` and `aliases`,
  normalised (lower-case, no accents, no hyphens, apostrophes or spaces; "Commune de la Gombe", "Kinshasa Province" and
  "Ville de Kinshasa" also match), so an address reverse-geocoded in either language resolves to the same area.
- `geo:*` replies are language-neutral (both names); the caller picks. Error messages are English on the wire and
  every client maps them to French (list below). Notices produced by area changes get French in `localize.ts`.
- Seeds and the admin geography page edit both names (`geo:update { name, nameEn, googleName, googleNameEn }`).

## Events — geography (any signed-in user or guest may read; admin writes)
| Event | Who | Payload | Reply |
|---|---|---|---|
| `geo:children` | all | `{ parentId?: string \| null, parentCode?: string, flatten?: 'commune' }` (none → the country's provinces) | `Area[]` sorted served first, then in display order (`sortOrder`, then name). `flatten: 'commune'` **(API addition)** returns every commune below the area instead (Kinshasa: its 24 communes in one call), each as `Area & { district: Area \| null }`, sorted **by district first** (the districts' display order; communes under no district last), then **served first**, then by name — so the districts never interleave and a served commune stays inside its own district block |
| `geo:communes` | all | `{ cityId?: string, cityCode?: string }` (default `CD-KN-KIN`) **(API addition)** | the same as `geo:children` with `flatten: 'commune'` (same order: district, served first, name) |
| `geo:servedCities` | all | — **(API addition)** | `Area[]` cities with any coverage (covered, or with a covered district / commune inside), by name: what the not-served message lists |
| `geo:tree` | all | `{ rootCode?: string, depth?: number }` (default: the country, full depth) | nested `Area & { children: Area[] }` |
| `geo:search` | all | `{ q: string, level?: AreaLevel, servedOnly?: boolean, limit?: number }` (limit default 20, max 100) | `Area[]` best matches first (exact, prefix, contains), served first; matches name, nameEn, googleName, googleNameEn, aliases |
| `geo:resolve` | all | `{ components?: {types: string[], long_name: string, short_name?: string}[], text?: {commune?, city?, province?, quartier?}, pin?: {lat,lng} }` | `{ area: Area \| null, chain: AreaChain, served: boolean, hubId: string \| null, hubName: string \| null, matchedBy: 'components'\|'text'\|'pin'\|null }` |
| `geo:create` | admin, admin_operations | `{ parentId, level, name, nameEn?, googleName?, googleNameEn?, aliases?, lat?, lng?, code? }` | `Area` (code generated when not given; a level must fit its parent: city → district / commune / quartier, district → commune, commune → quartier) |
| `geo:update` | admin, admin_operations | `{ id, name?, nameEn?, googleName?, googleNameEn?, aliases?, lat?, lng?, active?, sortOrder? }` | `Area` |
| `geo:setActive` | admin, admin_operations | `{ id, active }` **(API addition)** — shorthand of `geo:update` | `Area` |
| `geo:stats` | admin, admin_operations | `{ areaId }` **(API addition)** | `{ areaId, customers, sellers, orders }` counted in the area and everything below it |
| push `geo:updated` | everyone (guests too) | `Area` | — |

`geo:resolve` with `components` uses Google's `administrative_area_level_1` → province, `locality` → city (then
`administrative_area_level_2`), `sublocality_level_1` / `sublocality` / `administrative_area_level_3` → commune and
`neighborhood` → quartier. Each level must lie inside the previous match. A result whose `country` is not the DRC
(e.g. Brazzaville) resolves to `area: null`. With `text` and/or `pin` the deepest consistent source wins (components, then text,
then pin); a pin refines a province / city / district to the **nearest commune centroid** inside it (approximate: always send
the commune or `areaId` together with a pin when the warehouse matters), and alone resolves to the nearest commune within 25 km,
else the nearest city within 60 km, else `null`.

## Events — warehouses and coverage
| Event | Who | Payload | Reply |
|---|---|---|---|
| `hubs:list` (existing) | admin, staff | — | hubs gain `areaId`, `area` (Area), `coverage: (Area & {feeOverrideUsd})[]`, `riders`, `staff` (the active head counts; `activeRiders` / `staffCount` stay). Non-ops callers get `{id,name,city,country,lat,lng,active,areaId}` |
| `hubs:create` / `hubs:update` (existing) | admin, admin_operations (a manager may `hubs:update` name / address / capacity / position, never the area) | + `areaId` (location, **required on create**; `city` is derived from it when not sent) | the hub (HubView) |
| `hubs:coverage` | admin, **manager of that hub, any rider of that hub** | `{ hubId }` | `{ hubId, areas: (Area & { feeOverrideUsd: number \| null })[] }` |
| `hubs:assign` | admin, admin_operations | `{ hubId, areaIds: string[], move?: boolean, feeOverrideUsd?: number \| null }` | `{ assigned: Area[], conflicts: {area: Area, hubId, hubName}[] }` — owned areas are refused (listed in `conflicts`, the free ones are still assigned) unless `move: true`; `feeOverrideUsd` sets (number, USD) or clears (`null`) the flat delivery fee of the assigned rows; a moved area loses the previous owner's fee |
| `hubs:unassign` | admin, admin_operations | `{ hubId, areaIds: string[] }` | `{ removed: number }` |
| `coverage:map` | any admin role, warehouse staff | `{ rootId?: string }` | `{ areaId, hubId, hubName, direct: boolean }[]` for the SERVED areas of the subtree (unserved ones are absent; direct = the area itself is assigned) |
| `coverage:gaps` | admin, admin_operations | `{ rootId: string }` | `Area[]` communes (or the district / city when it has none) of a **partly served** city that nobody covers. A wholly unserved province or city is "coming soon", not a gap |
| push `coverage:updated` | everyone | `{ hubId, areaIds, fromHubIds?, movedAreaIds? }` | — (clients re-read served status; sent on assign / unassign / move, a warehouse switched on or off, created or renamed) |
| `rider:assignment` (existing) | rider | — | `{ hub: { id, name, city, address, lat, lng, areaId, coverage: (Area & {feeOverrideUsd})[] } \| null }` **(API addition: `areaId`, `coverage`)** |

Rules: **one owner per area** (unique index + a check); **the most specific covered area on the way up** (commune → district →
city → province) **decides** the warehouse; a warehouse that is switched off covers nothing (its areas fall to a wider owner or become
unserved). A flat `feeOverrideUsd` replaces base + per km of the addresses it decides (the transfer fee still applies).
Changing coverage never reroutes an order already placed; it recomputes every store's `originHubId`.

## Addresses, sellers, orders
- `addresses:create` / `addresses:update` accept `areaId` (most specific area) and optionally Google `components`. If `areaId` is
  missing the server resolves it from the components, the pin, then `commune` / `city` / `region` text. Every address payload
  (`addresses:list`, replies and `addresses:updated`) returns `areaId`, `areaChain: AreaChain` and `served: boolean`. `commune`,
  `city`, `region` (province) and `country` are rewritten with the areas' `googleName` (French spelling; `country` becomes
  "République démocratique du Congo"); `city` is no longer required when the area supplies it. An address nobody can place keeps
  its text, has `areaId: null`, `areaChain: []`, `served: false`. An unknown `areaId` → `Area not found.`
- Shipping addresses of `orders:create` and `delivery:quote` (the JSON string / the body) are resolved the same way from
  `areaId`, `components`, `commune`, `city`, `region`, `quartier` and the `geo` pin.
- Sellers: `sellers:update` accepts `pickupAreaId` (plus the existing pin and address); with only a new pin the area is derived
  from the pin. Store payloads (`sellers:mine`, `seller:updated`, admin lists) return `pickupAreaId`, `pickupAreaChain`, `pickupServed`,
  `originHubId`, `originHubName` (the warehouse covering the pickup area; null when unserved). These are never in the public storefront.
- `delivery:quote` accepts `{ addressId? | areaId?, geo?, city?, commune?, components?, lines }` (any client, guests included, except
  `addressId`) and replies:
  ```ts
  { feeUsd, deliveryUsd, transferUsd, distanceKm,
    defaultTransferUsd: number,                              // (API addition) the per-hop transfer fee (setting `deliveryTransferUsd`) a hop pays when its lane has no `costUsd`
    served: true,
    destinationHubId, destinationHubName, destinationHub: {id,name,city},
    destinationArea: Area, destinationAreaChain: AreaChain,
    originHubIds: string[],                                  // one per seller, in the order sellers first appear in `lines`
    origins: { sellerId, hubId, hubName, areaName, areaNameEn,
               fallback: null|'city'|'nearest'|'no_riders', coveringHubId, coveringHubName,
               hops: { fromHubId, fromHubName, toHubId, toHubName, transitHours,
                       costUsd: number,                      // the EFFECTIVE price of the hop: the lane's own `costUsd`, else `defaultTransferUsd` (never null)
                       laneCost: boolean }[],                // (API addition) true = the lane set that price (0 counts: a free lane); false = the default transfer fee applied
                                                             // hops is [] when nothing travels
               transitHours }[],
    transfer: boolean, pinned: boolean,
    fallback: null | 'city' | 'nearest' | 'no_riders',
    coveringHubId: string|null, coveringHubName: string|null, // set whenever `fallback` is set (any of the three values), null otherwise: the warehouse that covers the area but has no rider.
                                                             // With `'no_riders'` it is the same warehouse as `destinationHubId` (nobody else could stand in); an origin carries the same pair
    feeOverrideUsd: number|null,                             // the flat fee of the deciding coverage row, when one applied
    interCity: boolean, interCityDays: number,               // the inter-city allowance (setting) when the parcels cross cities
    transitHours: number,                                    // longest lane transit over the origins (0 with no lanes)
    extraDays: number }                                      // days added to the delivery estimate (see "Fee and estimate")
  ```
  `fallback`: `'city'` = the covering warehouse has no active rider and the nearest staffed warehouse **of the same city** delivers;
  `'nearest'` = none in the city, the nearest staffed one **of the same province**; `'no_riders'` = nobody nearby has a rider, the
  order stays on the covering warehouse and admins are told. `null` otherwise (an address without a pin is simply `pinned: false`,
  distance part 0; with `requirePinnedAddress` on it is refused with `Pin your delivery address on the map.`).
- **Not served** — `delivery:quote` and `orders:create` reply `ok: false` with the English message **and structured fields**:
  ```ts
  { ok: false, error: "We don't deliver to {area} yet.", code: 'not_served',
    areaId: string | null,            // null when nothing could be matched
    areaName: string | null,          // official (French) name, or the text the customer typed
    areaNameEn: string | null,        // English name
    servedCities: { id, name, nameEn }[] }   // geo:servedCities in short: "We deliver to: …"
  ```
  `{area}` in `error` is the French official name (or `this area` when nothing at all could be matched). Clients render their own
  sentence from `areaName` / `areaNameEn` and list `servedCities`. Nothing is reserved or written for a refused order.
- `orders:create` stores `destinationAreaId`, `routeBySeller` and the recorded `destinationHubId` / `originHubIds` / `originBySeller`;
  `estimatedDeliveryDate` includes `extraDays`. Orders already placed are never rerouted.
- Product listing for a seller whose pickup area is not served: `products:create` (and a seller resuming a draft) fails with
  `Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.` A store with no pickup
  area at all is governed by `requireSellerPickupPin`. An existing listing of a store whose area is unserved cannot be ordered:
  `One seller in your cart cannot ship from their area yet.`

## Fee and estimate
`feeUsd = deliveryUsd + transferUsd`.
- `deliveryUsd = min(deliveryMaxUsd, deliveryBaseUsd + deliveryPerKmUsd × km)` where km runs from the **delivering** warehouse to the
  customer's pin (0 without a pin), **or** the flat `feeOverrideUsd` of the area's coverage row (not capped).
- `transferUsd` = one transfer fee **per distinct hop** the parcels travel (`deliveryTransferUsd`, or the lane's `costUsd` when set);
  parcels of several sellers that share a hop pay it once. With no lanes a transfer is one direct hop (the old single transfer fee).
  The quote spells every hop out: `origins[].hops[].costUsd` is the effective price (the lane's, else `defaultTransferUsd`) and `laneCost`
  says which one it is, so `transferUsd` is the sum of the distinct hops' `costUsd`.
- `extraDays` added to the delivery estimate: the lanes' transit (`ceil(transitHours / 24)`) when lanes give one, else the
  `interCityTransferDays` setting for an order whose parcels cross cities, else 0 (never beyond the 30-day maximum).
- Inter-city = the seller's pickup city (else province) differs from the customer's. Refused with
  `Delivery between cities is not available right now.` when `allowInterCityDelivery` is `'false'`.

## Settings
- `allowInterCityDelivery` (`'true'` default) — public, admin-writable
- `interCityTransferDays` (`'3'` default, whole number 0–30) — public, admin-writable
- Existing: `deliveryBaseUsd`, `deliveryPerKmUsd`, `deliveryMaxUsd`, `deliveryTransferUsd`

## Seed accounts (dev seed)
- Warehouses:
  - "Entrepôt Kinshasa", in Gombe, covering province CD-KN, with riders `rider@somba.app` and staff `warehouse@somba.app` (manager) and `operator@somba.app`.
  - "Entrepôt Limete", in Limete, covering districts Mont-Amba and Tshangu, with rider `rider.limete@somba.app` and staff `warehouse.limete@somba.app` (supervisor).
  - No Paris hub, no Lubumbashi hub, no `rider.paris@` / `warehouse.paris@`. No lanes (transfers are direct).
- Sellers: `seller@somba.app` with pickup in Gombe, and `seller2@somba.app` with pickup in Limete.
- Customer addresses: Gombe (default) and Masina (area-linked and pinned). Demo orders are delivered to Gombe.
- Production bootstrap (`npm run bootstrap:prod`): all areas, ONE warehouse "Entrepôt Kinshasa" (Gombe, pinned) covering CD-KN, no demo hubs.

## Multi-warehouse transfers (UC-10 lanes + multi-hop, UC-11 transfer runs)
Lanes (admin):
| Event | Who | Payload | Reply |
|---|---|---|---|
| `lanes:list` | admin, staff | `{ hubId? }` | `{ id, fromHubId, fromHubName, toHubId, toHubName, transitHours, costUsd, active, bidirectional }[]` (one row per direction; `bidirectional` = the opposite lane exists) |
| `lanes:upsert` | admin, admin_operations | `{ id?, fromHubId, toHubId, transitHours, costUsd?: number \| null, active?, bidirectional?: boolean }` | lane (the same pair is updated, not duplicated; `bidirectional: true` creates/updates both directions, `false` removes the way back, omitted leaves it) |
| `lanes:remove` | admin, admin_operations | `{ id, both?: boolean }` | `{ removed: true }` |
| `routes:preview` | admin, staff | `{ fromHubId, toHubId }` | `{ hops: {fromHubId, toHubId, transitHours, costUsd}[], totalHours, direct: boolean }` — `direct` = one hop; no lane at all gives the direct hop; lanes that exist but do not connect the two → error `These warehouses are not connected by any lane.` |
| push `lanes:updated` | admin, staff | the full lane list **(API addition)** | — |

Routing:
- The route is the shortest chain of **active lanes between active warehouses**, by transit time (ties: fewer hops). With no
  active lane at all, it is a direct transfer. If lanes exist but none connects the two warehouses, the transfer goes direct and
  admins get a "Warehouses not connected" notice (at checkout and again whenever a later hop is planned).
- The quote reply carries `origins[].hops` and `transitHours` (above). The fee is the transfer fee per hop, or the lane's
  `costUsd` when set (`routes:preview` keeps the lane's own `costUsd`, `null` = the default fee; the quote resolves it).
  The estimate adds the transit hours.
- Orders store the planned route per seller: `routeBySeller: { [sellerId]: hubId[] }` (origin first, destination last; one entry when
  nothing travels). It is updated as hops are re-planned.

Tasks:
- `delivery_tasks` gain `runId`, `finalHubId`, `hop`, `hops`. A transfer leg goes to the **next** hub (`toHubId`); `finalHubId` is the
  end of the chain (= `toHubId` on a single hop and on the last hop). Return legs (`return_transfer`) chain the same way, in reverse.
- Scanning in at an intermediate hub creates the next hop at once: **unassigned**, with no driver — each hop is assigned by that
  hop's sending warehouse and the previous hop's driver is never inherited. The next hop is planned at that scan-in over today's lanes
  (a lane switched off mid-route only affects hops not yet created). A transfer may still use riders of either end of its hop.
- Returns follow the order's recorded route in reverse (when its lanes still exist, else the shortest chain now); replacements run the
  order's route forwards ending in `replacement_delivery`.
- Every TaskView carries `finalHubId`, `runId`, `runReference`, `hop` (1-based) and `hops` (total); both are 1 on every non-transfer leg.
- Customer tracking (`order.tracking.legs`, one entry per leg, so **one per hop**): `kind: 'transfer'`, `hop`, `hops`, `runId`,
  `runReference`, flat `fromHubName` / `toHubName` (and the `fromHub` / `toHub` objects), `riderFirstName` (of that hop), and the times.
- A task that belongs to a run cannot be assigned or scanned out on its own: `This parcel is part of a transfer run. Manage it from the run.`

Transfer runs (warehouse desk; supervisor+ of the SENDING hub to create, change, split, assign and dispatch; any staff of the receiving hub to
receive; supervisor+ of either hub to close; admins everything):
| Event | Payload | Reply |
|---|---|---|
| `logistics:runs` | `{ status?: 'planned'\|'dispatched'\|'arrived'\|'closed'\|'open', direction?: 'out'\|'in', hubId? (admins) }` | `Run[]` for my hub (`open` = not closed) |
| `logistics:runProposals` | `{ hubId? (admins) }` | `{ toHubId, toHubName, taskIds, count }[]` transfer legs (`transfer`, `return_transfer`) waiting at my hub, in no run, grouped by next hub |
| `logistics:createRun` | `{ toHubId, taskIds }` (admins also `fromHubId`) | `Run` (status `planned`) |
| `logistics:updateRun` | `{ runId, addTaskIds?, removeTaskIds? }` | `Run` (only while `planned`) |
| `logistics:splitRun` | `{ runId, taskIds }` | `{ original: Run, created: Run }` — only while `planned`; moves those tasks into a new run on the same lane (assign it its own driver); the moved parcels lose the original's driver; not all of the run's parcels may move |
| `logistics:assignRun` | `{ runId, riderId }` | `Run` — the rider must be from the sending or the receiving hub; the rider is the run's one driver |
| `logistics:dispatchRun` | `{ runId }` | `Run` (`dispatched`; every task becomes `picked_up` with the run's rider; the receiving warehouse is told) |
| `logistics:receiveRun` | `{ runId, taskIds?: string[] }` | `Run` — scans in the given tasks, or all still on the road (each scan runs the normal next-leg logic); the first scan makes the run `arrived` |
| `logistics:closeRun` | `{ runId }` | `Run` (`closed`; tasks not received become `failed` "Parcel missing from run {ref}." and an exception at the receiving warehouse; both warehouses and admins are told) |

- `Run`: `{ id, reference ("TR-0042"), fromHubId, fromHubName, toHubId, toHubName, riderId, riderName, status, taskIds, count,
  receivedCount, missingCount, inTransit, createdAt, dispatchedAt, inTransitAt, arrivedAt, closedAt }`. `inTransit` **(API addition)** is
  true once the driver reported the run on the road.
- Push `run:updated` (the `Run`) goes to both hubs' rooms, the admins and the run's rider.
- **One driver per run; several drivers on a lane = several runs** (use `logistics:splitRun`). Each hop is a separate run, assigned by that hop's sending hub.
- Rider: `rider:runs` lists the runs assigned to me (open ones, and those closed in the last 3 days). `delivery:updateStatus` on any task of a dispatched run with
  `in_transit` marks the whole run in transit; `rider:runStatus { runId, status: 'in_transit' }` does the same explicitly (reply: the `Run`).
- Analytics: `analytics:warehouse` gains `runs: { total, byLane: { fromHubId, from, toHubId, to, runs, parcels, parcelsPerRun, missing, avgTransitMinutes }[] }` (30 days)
  and `byCommune: { areaId, area, areaEn, level, hubId, hub, orders, delivered, failed, failureRatePct, avgDeliveryMinutes }[]` (customer deliveries per commune, 30 days;
  quartiers count in their commune); `byHub` stays.

## Notices added (all have French in `notifications/localize.ts`)
`Warehouse without riders` (the covering warehouse has no rider and another delivers/collects: admins, covering + standing-in staff),
`Warehouses not connected` (admins), `Transfer run assigned` (the driver), `Transfer run on its way` (receiving staff),
`Parcel missing from run` (both warehouses + admins). Reused: `Address without a map pin`, `No warehouse with riders`.

## Errors (English on the wire → French in clients)
Geography and coverage:
- `This area is already covered by {hub}.` (a lost race on the unique index; normally owned areas come back in `conflicts`)
- `Choose where this warehouse is.` (`hubs:create` without `areaId`)
- `Area not found.`
- `Hub not found.` / `Choose at least one area.` / `Flat delivery fee must be a number between 0 and 500.`
- `An area with this name already exists here.` / `An area with this code already exists.` / `A {level} cannot be added under a {level}.` / `Level must be one of: country, province, city, district, commune, quartier.`
- `Active must be true or false.` / `Not allowed.`
- `A warehouse cannot cover an area it is not allowed to serve.` (never thrown for MVP; reserved)
- `Flatten must be 'commune'.` (`geo:children` with any other `flatten`)
- `Aliases must be a list of names.` / `Alias must be 1-100 characters.`
- `Name must be 2-150 characters.` / `English name must be 2-150 characters.` / `Google name must be 1-150 characters.` / `Google name (English) must be 1-150 characters.` / `Code must be 2-64 characters.` / `Order must be a whole number between 0 and 100000.` (the field checks of `geo:create` / `geo:update`)
- `Code may only contain letters, digits and hyphens.`
- `Enter a valid latitude (-90 to 90) and longitude (-180 to 180).` (areas and warehouses)
- `Sign in to continue.` (`hubs:coverage` and the other signed-in-only events, asked by a guest)

Warehouses (`hubs:*`):
- `Place the warehouse on the map: latitude and longitude are required.`
- `A hub with this name already exists.` / `You cannot deactivate the last active hub.`
- `Hub must be 1-64 characters.` / `Hub name must be 2-100 characters.` / `City must be 2-100 characters.` / `Country must be 1-100 characters.` / `Address must be 3-200 characters.` / `Capacity must be a whole number between 1 and 1000000.`
- `Only managers can see the staff list.` / `Only managers can change staff tiers.` / `Tier must be one of: operator, supervisor, manager.` / `Only warehouse staff have a tier.` / `You cannot change your own tier.` / `This person works at another warehouse.` / `Only an administrator can make someone a manager.`

Addresses:
- `Address not found.` (`delivery:quote` with an `addressId` the account does not own)
- `Street address and city are required.` (`addresses:create` when neither the text nor the area gives a street and a city)

Routing and checkout:
- `We don't deliver to {area} yet.` (with the structured fields above; `{area}` may be `this area`)
- `Delivery between cities is not available right now.`
- `One seller in your cart cannot ship from their area yet.`
- `Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.`
- `Pin your delivery address on the map.` / `Delivery is not available right now: no warehouse is open.`

Lanes and runs:
- `These warehouses are not connected by any lane.` / `A lane connects two different warehouses.` / `Lane not found.`
- `Transit time (hours) must be a number between 0 and 720.` / `Lane cost must be a number between 0 and 1000.` / `Bidirectional must be true or false.`
- `This run has already left.` / `This run has not left yet.` / `This run is already closed.` / `Run not found.`
- `Only parcels waiting at this warehouse can join this run.` / `Choose at least one parcel.` / `Choose parcels of this run.` / `Choose some of the parcels of this run, not all of them.` / `That parcel is not in this run.`
- `Choose a driver for this run first.` / `This run has no parcels left to send.` / `Choose an active rider.` / `This rider works at another warehouse.`
- `Parcel missing from run {ref}.` (the failure reason / exception text)
- `This parcel is part of a transfer run. Manage it from the run.`
- Reused desk errors: `Only supervisors and managers can assign riders.`, `This task belongs to another warehouse.`, `This parcel is not due at your warehouse.`, `Your account is not linked to a warehouse. Ask an administrator.`, `Choose a warehouse.`, `Staff only.`, `Riders only.`
- `Status must be in_transit.` (`rider:runStatus`)

Warehouse desk (`logistics:*` of the same gateway, see `logistics.md`; listed here because the transfer screens show them too):
- `This parcel is not due at a warehouse.` / `This parcel does not leave from a warehouse.` (`logistics:scanIn` / `logistics:scanOut` by an admin when the task names no warehouse)
- `Delivery task not found.` / `This task is finished by the rider, not scanned in.` / `This parcel was already scanned in.` / `A failed task cannot be scanned in.` / `A rider must collect this parcel before it can be scanned in.`
- `This delivery was just updated. Refresh and try again.` / `This delivery is no longer available.` / `Assign a rider before handing the parcel over.` / `This parcel does not leave from your warehouse.`
- The manual return and replacement levers (`logistics:createReturnPickup`, `logistics:createReplacementDelivery`): `Case must be 1-64 characters.` / `Order not found.` / `This order has no destination warehouse.` / `One of the returned items is not on this order.` / `A replacement or an exchange is required.` / `Replacement not found.`
