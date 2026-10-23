# Warehouses, zones and riders

How a delivery finds its rider. Each **zone** (a commune, or a group of them) belongs to one **warehouse**. Each **rider** and **warehouse employee** has a home warehouse. A new delivery goes to the warehouse that serves the customer's zone, and only that warehouse's riders see it and are told about it.

```
customer's commune ──► zone ──► warehouse ──► its riders (their preferred zones first)
                                         └──► its staff (parcels, batches, riders lists)
```

## Setting it up (admin portal)

1. **Warehouses** (Admin → Warehouses): the hubs that exist.
2. **Zones** (Admin → Zones):
   * every zone has a *Warehouse* picker; save after changing it;
   * a banner counts zones with no warehouse, whose deliveries are offered to every rider;
   * a zone can only point at a warehouse that exists (the server refuses an unknown one).
3. **People** (Admin → Warehouses → Staff, *Warehouse staff* and *Riders* tabs, or the Roles page):
   * *Set warehouse* picks the home warehouse;
   * for riders it also picks their **preferred zones**, chosen among that warehouse's zones.
   * Saving signs the person out so they come back with the new warehouse.
4. **Warehouse detail** (Admin → Warehouses → a hub) lists the zones it delivers, its riders (with their preferred zones and open jobs) and its staff.

Nobody is required to have a warehouse. A rider or employee without one sees everything, as before this change, and a delivery with no warehouse is offered to every rider.

## What happens to an order

1. **Zone.** The customer's zone is the one they picked. If it's missing or unknown, the server takes it from the address's commune, matched the same way as the customer app (`api/src/common/zones/zone-match.ts`, mirroring `mobile/lib/util/zone_match.dart`). An address that matches no zone is refused, as before.
2. **Warehouse.** When the delivery task opens (order paid), it gets `hubId` from the zone's warehouse. If the zone has none and there is exactly one active warehouse, it uses that one; otherwise none. A failed delivery's retry keeps the same warehouse.
3. **Riders.**
   * The new task is pushed live (`delivery:updated`) to the room of its warehouse's riders and to riders without a warehouse.
   * A saved notice "New delivery available" (with a push) goes to the active riders of that warehouse, plus riders without one; with no warehouse, to every rider.
4. **Taking it.**
   * A rider's *Available* list (`rider:tasks`, `delivery:unassigned`) shows their warehouse's open tasks plus tasks with no warehouse, preferred zones first, each with its zone name and a "Your zone" badge.
   * A rider cannot accept another warehouse's task.
   * Admins can still assign any task to any rider.
5. **Warehouse staff** work on their own warehouse:
   * the parcel list (`delivery:list`), the batch builder and the riders list (`warehouse:riders`) are filtered to it;
   * a batch or manual assignment must use one of its riders, and staff cannot assign another warehouse's parcel.
   * Admins see every warehouse and can filter by one (`hubId` on those calls).

## Where riders see it

* **Rider app:** Profile → *Home warehouse* card (warehouse, its zones, your zones); *Available* cards show the zone and "Your zone".
* **Rider web portal:** *My zone* shows the warehouse and zones, with open work grouped by zone (yours first); Profile → *Where I work*.

## API

| Event | Who | What |
|---|---|---|
| `roles:setHub {userId, hubId \| null, preferredZones?}` | admin, operations | Set a rider's or employee's warehouse (and a rider's zones). The user's sockets are disconnected so they rejoin the right rooms. |
| `rider:assignment` | rider | `{hub, preferredZones:[{id,name}], hubZones:[{id,name}]}` |
| `roles:staff` | super admin | Each account now carries `hubId` and `preferredZones` |
| `me:get`, sign-in | everyone | The profile carries `hubId` and `preferredZones` |
| `settings:set deliveryZones` | config roles | Zones may carry `hubId`, which must be an existing warehouse |

Data:

* `users.hubId` (indexed) and `users.preferredZones` (JSON list of zone ids);
* `delivery_tasks.hubId` (indexed);
* `hubId` inside each `deliveryZones` item.

Migration `1792930000000-WarehouseLinks`. The seed ties Gombe and Limete to the Kinshasa hub, the Paris zones to the Paris hub, and puts the demo rider (preferring Gombe) and the demo warehouse employee in Kinshasa.

## Tests

* `api/src/warehouse/rider-hub.spec.ts`: hub filters, preferred-first ordering, rider lists, assignment.
* `api/src/common/zones/zone-match.spec.ts`: commune matching.
* `api/test/warehouse-zones-smoke.cjs` (36 checks, `npm run smoke:zones`):
  * zones tied to warehouses (unknown warehouse refused);
  * riders and staff placed, and preferred zones checked against the warehouse;
  * an order's zone taken from its commune;
  * each delivery belongs to its zone's warehouse;
  * each rider sees, is told about and gets live updates for their own warehouse only;
  * cross-warehouse accept refused;
  * staff lists filtered, and cross-warehouse batches and assignments refused;
  * admins see and assign across warehouses.
