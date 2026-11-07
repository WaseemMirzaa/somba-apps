# Rider vehicle and compliance documents

Owner: the rider-compliance API builder (`api/src/rider-compliance/`). The web (`web/src/components/warehouse/rider-compliance.tsx`)
and the rider app (`rider-app/lib/screens/vehicle_screen.dart`, `documents_screen.dart`) code against this file.

All events are Socket.IO events on the one authenticated socket. Every request gets the standard ack `{ ok: true, data }` or
`{ ok: false, error }`; error strings are stable English texts the clients map to French by exact match.

**Nothing here blocks a rider from working.** An expired, expiring or rejected document is a warning on the views and nothing more.

## Who may do what

| | read own | upload | read a rider's record | edit vehicle | approve / reject | open a scan |
|---|---|---|---|---|---|---|
| the rider | yes | yes | no | no | no | their own |
| `admin`, `admin_operations` | | | any rider | any rider | any rider | any rider's |
| `warehouse_staff` supervisor or manager | | | riders of their OWN warehouse | same | same | same |
| `warehouse_staff` operator, other admin roles, customer, seller | | | no | no | no | no |

A rider of another warehouse is answered `Rider not found.` (not "forbidden"). A warehouse member's warehouse and tier are read from the
database on every call. Every staff write is audited with the staff member's name and role: `rider.vehicle.updated` (field NAMES only),
`rider.document.approved`, `rider.document.rejected` (the type, the rider id and the rejection reason; never a plate, a number or a file).

## Documents are private files

1. The app uploads the scan with `POST /api/v1/private-uploads` (Bearer token, multipart field `file`): the store sniffs the real type from
   the bytes (JPEG, PNG, WebP or PDF, 5 MB at most) and answers `{ id, url, mime, size }`.
2. `rider:documentUpload` attaches that file to a document. Only JPEG, PNG and PDF are kept (WebP is refused), the file must be the
   rider's own, and a file can back one document only. From then on the file's kind is `rider_doc`: only its owner and the staff above
   may open it (the store-application reviewers lose their blanket access to this kind).
3. Staff open a scan with the existing `private:link { id: fileId }` (a 5-minute signed link).

The document number is personal data and is encrypted at rest.

## Rider events

| event | payload | reply |
|---|---|---|
| `rider:vehicle` | none | `VehicleView` (all fields null and `exists: false` until staff save it) |
| `rider:documents` | none | `DocumentView[]`, newest first |
| `rider:documentUpload` | `{ type, number?, expiresOn?, fileId }` | the new `DocumentView` (`status: 'pending'`) |

`type` is one of `driver_licence`, `vehicle_insurance`, `vehicle_registration`, `id_card`, `other`. `expiresOn` is `YYYY-MM-DD`. At most 30 documents per rider.

## Staff events

| event | payload | reply |
|---|---|---|
| `riderCompliance:get` | `{ riderId }` | `{ rider: { id, name, hubId }, vehicle, documents, canEdit: true }` |
| `riderCompliance:updateVehicle` | `{ riderId, model?, type?, plate?, colour?, odometerKm?, fuel?, insuranceValidUntil?, lastServiceOn?, nextServiceOn? }` | `VehicleView`. Only the keys sent change; `null` or `''` clears one |
| `riderCompliance:reviewDocument` | `{ id, decision: 'approve' \| 'reject', reason? }` | `DocumentView`. A rejection needs a reason of 3-300 characters; the rider gets a notice (EN + FR) |

Vehicle fields: `type` is `motorbike`, `scooter`, `bicycle`, `car`, `van`, `truck` or `other`; `fuel` is `petrol`, `diesel`, `electric`,
`hybrid` or `none`; the plate is upper-cased; `odometerKm` is a whole number 0..5,000,000; dates are real calendar dates `YYYY-MM-DD`.

## Pushes

`rider:vehicle:updated` (a `VehicleView`) and `rider:document:updated` (a `DocumentView`) to the rider; `riderCompliance:updated { riderId }` to
admins and to the rider's warehouse room (refetch with `riderCompliance:get`).

## Views

```
VehicleView  { riderId, exists, model, type, plate, colour, odometerKm, fuel, insuranceValidUntil, lastServiceOn, nextServiceOn,
               insurance: { state, daysLeft }, service: { state, daysLeft }, updatedByName, updatedAt }
DocumentView { id, riderId, type, number, expiresOn, expiry: { state, daysLeft }, status, fileId, mime, size,
               reviewedByName, reviewedAt, rejectionReason, createdAt }
```

`state` is `none` (no date), `valid`, `expiring` (30 days or fewer left, the last valid day included) or `expired` (for `service`, "overdue").
Days are UTC calendar days. `status` is `pending`, `approved` or `rejected`.

## Errors (new)

`Rider not found.`, `Not allowed.`, `Riders only.`, `Only supervisors and managers can see or change rider documents.`, `Document not found.`,
`Decision must be approve or reject.`, `Give a reason of 3-300 characters.`, `This document is already approved.`,
`Upload the file first, then send it with its file id.`, `Upload the file again and retry.`, `Only JPEG, PNG or PDF files are accepted.`,
`The file is too large (5 MB at most).`, `This file was already sent. Upload a new one.`,
`You have reached the limit of documents. Ask your warehouse to review the ones you sent.`, `Document type must be one of: ...`,
`Expiry date must be a date written YYYY-MM-DD.`, `Model|Plate|Colour|Odometer ... ` validation sentences, `Type must be one of: ...`, `Fuel must be one of: ...`.
