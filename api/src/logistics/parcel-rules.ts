import type { DeliveryTask, Parcel } from '../database/entities';
import { kindLabel } from './leg-rules';

/** The shape the cargo rules need from a leg. */
export type CargoTask = Pick<DeliveryTask, 'kind' | 'sellerId' | 'sellerIds' | 'disputeId' | 'replacementId' | 'exchangeId'>;
export type CargoParcel = Pick<Parcel, 'sellerId' | 'returnId'>;

const RETURN_KINDS = ['return_pickup', 'return_transfer', 'return_to_seller'];

/** The setting that switches the blocking rules on. Unset counts as on: scanning is the default way of working. */
export const REQUIRE_PARCEL_SCAN = 'requireParcelScan';
export const scanRequired = (value: string | null | undefined): boolean => value !== 'false';

/**
 * Does this parcel travel on this leg? (Pure, so the same rule serves the rider's scan, the desk's scan and the views.)
 *  - a `pickup` / `express` / `transfer` leg carries its seller's package (the seller's parcels of the order);
 *  - a `delivery` leg carries the parcels of its `sellerIds` (null = a legacy leg that carries every seller's);
 *  - a return leg carries the return's own parcel (the box the customer sends back);
 *  - a replacement / exchange leg carries no labelled parcel.
 */
export function cargoMatches(task: CargoTask, parcel: CargoParcel): boolean {
  if (task.replacementId || task.exchangeId) return false;
  if (RETURN_KINDS.includes(task.kind)) return !!task.disputeId && parcel.returnId === task.disputeId;
  if (parcel.returnId) return false;
  switch (task.kind) {
    case 'pickup':
    case 'express':
    case 'transfer':
      return task.sellerId ? parcel.sellerId === task.sellerId : parcel.sellerId != null;
    case 'delivery': {
      if (!task.sellerIds) return parcel.sellerId != null;
      return task.sellerIds.includes(parcel.sellerId);
    }
    default:
      return false;
  }
}

/** "Scan every parcel first: 2 of 3 scanned." */
export const scanEveryParcel = (scanned: number, total: number) => `Scan every parcel first: ${scanned} of ${total} scanned.`;

/** What a refusal says about the leg: "pickup", "transfer", "express delivery". */
export const legNoun = (kind: DeliveryTask['kind']) => kindLabel(kind);

export const notPartOf = (code: string, kind: DeliveryTask['kind']) => `${code} is not part of this ${legNoun(kind)}.`;
export const alreadyScanned = (code: string) => `${code} was already scanned.`;
export const cancelledLabel = (code: string) => `${code} was cancelled; use the new label.`;
export const BOXES_LOCKED = 'The rider already scanned these boxes. Contact support to change them.';
