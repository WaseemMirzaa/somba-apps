# Proof of delivery (photo and signature)

A rider can attach a photo of the parcel at the door and the customer's signature to a delivery to the customer. Both are
optional. The delivery code stays the authoritative check, and a delivery without proof completes exactly as before.
Customer-facing visibility is out of scope.

## Data

`delivery_proofs` (entity `DeliveryProof`, migration `1793300000001-DeliveryProof`), one row per task (unique `taskId`):
`orderId`, `riderId`, `photoFile` / `photoMime`, `signatureFile` / `signatureMime` (all four nullable), `createdAt`,
`updatedAt`. Only file NAMES are stored. The files live in `$PRIVATE_UPLOAD_DIR/pod/` (default `uploads-private/pod/`),
never under the public `/uploads`. Back this folder up and keep it on the same persistent volume as the KYC documents.

## Rider upload: `POST /api/v1/delivery-proofs/:taskId`

Multipart, Bearer token, fields `photo` and/or `signature` (at least one). 20 requests per minute.

| Rule | Answer |
| --- | --- |
| Not a rider | 403 `Riders only.` |
| Task missing or not assigned to the caller | 404 `Delivery task not found.` (same answer, ids cannot be probed) |
| Leg is not a `delivery` / `replacement_delivery` | 400 `Proof of delivery is only taken on a delivery to the customer.` |
| Status not `picked_up` / `in_transit` (or `delivered` less than 30 minutes ago) | 400 `Proof can only be added while the delivery is under way.` |
| Photo not JPEG or PNG (sniffed from the bytes, not the MIME) | 400 `The photo must be a JPEG or PNG image.` |
| Signature not PNG | 400 `The signature must be a PNG image.` |
| Photo over 4 MB / signature over 1 MB | 400 `The photo is too large (4 MB at most).` / `The signature is too large (1 MB at most).`; a body over the multipart cap is 413 |
| Nothing sent | 400 `Add a photo or a signature.` |

Everything is validated before anything is written. A second upload replaces the files of the same part and deletes the old
ones. Answer: `{ taskId, hasPhoto, hasSignature, capturedAt }`.

The rider app uploads BEFORE it sends `delivery:updateStatus` (`delivered`), so a proof that cannot be saved is never lost
silently: the sheet stays open with the reason, and the rider can retry or choose "Deliver without proof". `delivery:updateStatus`
is unchanged (`taskId`, `status`, `code`, `cashUsd`). Proof is shown only once the leg is `delivered`; a photo taken before a
refused code is never served.

## Staff read

Who may read: `admin`, `admin_operations`, `admin_support`, and `warehouse_staff` whose warehouse is the task's `hubId`,
`fromHubId` or `toHubId` (active accounts only). Everyone else gets `Delivery task not found.`

- Socket `deliveryProof:get` `{ taskId }` -> `{ photoUrl, signatureUrl, capturedAt, expiresAt }` (a part that was not captured
  is `null`), or `data: null` when the delivery has no proof. The URLs are 5-minute signed links (HMAC, per task, part and
  account). Each opening is recorded in the audit log (`delivery.proof_viewed`, entity `delivery`).
- `GET /api/v1/delivery-proofs/:taskId/:part` (`part` = `photo` | `signature`): Bearer token, or the signed link. `Cache-Control:
  private, no-store`, `X-Content-Type-Options: nosniff`. 401 without a valid login or link.

Web: the card "Proof of delivery" on the leg page (`/warehouse/tasks/:id`, also served at `/admin/fulfillment/tasks/:id`).
