# Warehouse delivery flows — zones & inter-warehouse transfers

The warehouse portal routes every parcel through one or more **legs** based on
its **delivery type**. Warehouses belong to a city and serve one or more
**zones** (e.g. Kinshasa Hub → Zone A Gombe / Zone B Limete / Zone C Bandal;
Paris → Zone A Île-de-France / Zone B Versailles; Lyon → Zone Rhône-Alpes).

Managed in the portal:
- **Deliveries** tab → parcels grouped by delivery type (Local / Cross-zone /
  Inter-warehouse / Returns), each parcel expandable to its leg-by-leg journey.
- **Transfers** tab → the inter-warehouse line-haul board (hub → hub runs with
  their parcels). Visible to Supervisor + Manager; Operators execute the
  receiving/dispatch legs.

Data: `web/src/lib/warehouse-transfers.ts`. UI: `web/src/app/warehouse/deliveries`,
`web/src/app/warehouse/transfers`, `web/src/components/warehouse/parcel-journey.tsx`.

## Use cases

### UC1 — Local (same zone)
Customer is in the same zone as the fulfilling warehouse.
```
Warehouse (Zone A) ──last-mile rider──▶ Customer (Zone A)
```
Single leg. Example: `WP-5001` Kinshasa Hub Zone A (Gombe) → customer Zone A.

### UC2 — Cross-zone (same warehouse)
One warehouse serves several zones; the customer is in a different zone than the
warehouse's home zone, but still served by the same hub.
```
Warehouse (Zone A) ──last-mile rider──▶ Customer (Zone B)
```
Single leg, different destination zone. Example: `WP-5002` Kinshasa Hub Zone A →
customer Zone B (Limete).

### UC3 — Inter-warehouse transfer (different warehouses & zones)
The fulfilling warehouse is in another city/zone than the customer. The parcel
first travels hub-to-hub on a **line-haul transfer**, then last-mile from the
destination hub.
```
WH-A (Zone A) ──line-haul transfer──▶ WH-B (Zone B) ──last-mile rider──▶ Customer (Zone B)
```
Two legs; the line-haul leg is part of a **TransferRun** on the Transfers tab.
Example: `WP-5003` Paris (Zone A Île-de-France) → transfer `TR-9001` → Lyon (Zone
Rhône-Alpes) → rider → customer.

### UC4 — Returns (reverse)
The reverse of the outbound flow. A rider picks up from the customer to the
nearest hub; if the item must go back to the origin warehouse in another zone, a
return line-haul transfer carries it back.

Local return (one leg):
```
Customer (Zone B) ──pickup rider──▶ Warehouse (Zone A)
```
Example: `WP-5005` customer Zone B (Limete) → Kinshasa Hub.

Inter-warehouse return (two legs):
```
Customer (Zone B) ──pickup rider──▶ WH-B ──return line-haul──▶ WH-A (Zone A)
```
Example: `WP-5006` customer Rhône-Alpes → Lyon Hub → return transfer `TR-9002`
→ Paris Hub.

## Leg & transfer states
- **Leg status:** pending → in_progress → done. The parcel's *current leg* is
  highlighted in the journey timeline.
- **Transfer status:** scheduled → loading → in_transit → arrived → received at
  hub. Transfers carry a direction (`outbound` fulfilment vs `return`).

> Prototype note: data is mocked; action buttons (Mark arrived / Receive at hub /
> Escalate) raise toasts and do not mutate persisted state.
