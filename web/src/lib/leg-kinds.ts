/**
 * The kinds of leg and what they are called (EN / FR), with the small predicates every portal asks of a kind
 * (does it end at a warehouse, does it meet the customer, is it a customer-bound leg).
 * No imports: `npm test` loads this file on its own. `logistics.ts` re-exports all of it.
 */

export type LegKind =
  | "pickup"
  | "transfer"
  | "delivery"
  | "express"
  | "return_pickup"
  | "return_transfer"
  | "return_to_seller"
  | "replacement_delivery";

export type L = { en: string; fr: string };
export const pickL = (l: L | undefined, fr: boolean, fallback = "") => (l ? (fr ? l.fr : l.en) : fallback);

export const LEG_KIND: Record<LegKind, L> = {
  pickup: { en: "Seller pickup", fr: "Collecte vendeur" },
  transfer: { en: "Transfer between warehouses", fr: "Transfert entre entrepôts" },
  delivery: { en: "Customer delivery", fr: "Livraison client" },
  express: { en: "Express delivery", fr: "Livraison express" },
  return_pickup: { en: "Return pickup", fr: "Collecte de retour" },
  return_transfer: { en: "Return transfer", fr: "Transfert de retour" },
  return_to_seller: { en: "Return to seller", fr: "Retour au vendeur" },
  replacement_delivery: { en: "Replacement delivery", fr: "Livraison de remplacement" },
};

/** Short names for the desk tabs. */
export const LEG_KIND_SHORT: Record<LegKind, L> = {
  pickup: { en: "Pickups", fr: "Collectes" },
  transfer: { en: "Transfers", fr: "Transferts" },
  delivery: { en: "Deliveries", fr: "Livraisons" },
  express: { en: "Express", fr: "Express" },
  return_pickup: { en: "Return pickups", fr: "Collectes de retour" },
  return_transfer: { en: "Return transfers", fr: "Transferts de retour" },
  return_to_seller: { en: "Back to seller", fr: "Retours vendeur" },
  replacement_delivery: { en: "Replacements", fr: "Remplacements" },
};

export const LEG_KINDS = Object.keys(LEG_KIND) as LegKind[];

/** Legs that finish when hub staff scan the parcel in. */
export const HUB_BOUND: LegKind[] = ["pickup", "transfer", "return_pickup", "return_transfer"];
/** Legs that finish when the rider hands the parcel over. */
export const RIDER_FINISHED: LegKind[] = ["delivery", "express", "replacement_delivery", "return_to_seller"];

/** The legs that carry an order to its customer: the warehouse's delivery, or an express run straight from the seller. */
export const CUSTOMER_KINDS: LegKind[] = ["delivery", "express"];
export const isCustomerLeg = (k: LegKind | string) => (CUSTOMER_KINDS as string[]).includes(k);
/** An express leg the seller has not packed yet (`readyAt` empty): a rider can still be assigned by hand, but there is nothing to collect. */
export const isWaitingForSeller = (t: { kind: LegKind | string; readyAt?: string | null; status?: string }) =>
  t.kind === "express" && !t.readyAt && (t.status === undefined || t.status === "unassigned" || t.status === "assigned");
/** "Part of the order" is a statement about a customer leg only: seller pickups, transfers and returns never carry it. */
export const isPartialLeg = (kind: LegKind | string, completesOrder?: boolean | null, orderPartial?: boolean | null) =>
  isCustomerLeg(kind) && (orderPartial === true || completesOrder === false);
export const PARTIAL_LABEL: L = { en: "Part of the order", fr: "Partie de la commande" };

export const isHubBound = (k: LegKind | string) => (HUB_BOUND as string[]).includes(k);

/** Legs that meet the customer face to face. */
export const meetsCustomer = (k: LegKind | string) =>
  k === "delivery" || k === "express" || k === "replacement_delivery" || k === "return_pickup";

