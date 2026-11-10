/**
 * Split delivery and express, as the order pages show them (docs/contracts/logistics.md §16 and the express leg).
 *
 * A multi-seller order waits for every parcel, but once the oldest waiting parcel is older than the admin's limit the
 * parcels that arrived go out alone and the rest follows. The customer then has several delivery legs, each with its own
 * lines (`tracking.legs[].items`), and the lines already handed over carry `deliveredAt`. An express order has one leg
 * that goes from the seller straight to the customer.
 *
 * No runtime imports: `npm test` loads this file on its own.
 */

export interface SplitLine {
  fulfilment?: string | null;
  deliveredAt?: string | null;
}

export interface SplitLeg {
  id?: string;
  kind?: string;
  status?: string;
  createdAt?: string;
  completesOrder?: boolean;
}

const CUSTOMER_LEG_KINDS = ["delivery", "express"];

/** A line that still counts: the seller did not cancel it. */
export const isLiveLine = (l: SplitLine) => l.fulfilment !== "cancelled";

/** The live lines split by whether the customer already has them. */
export function splitLines<T extends SplitLine>(items: readonly T[] | null | undefined): { delivered: T[]; coming: T[] } {
  const live = (items ?? []).filter(isLiveLine);
  return { delivered: live.filter((l) => !!l.deliveredAt), coming: live.filter((l) => !l.deliveredAt) };
}

/**
 * Part of the order reached the customer and the rest has not. The server says so for the customer
 * (`partiallyDelivered`); staff payloads do not carry it, so it is read from the lines. A finished order is never partial.
 */
export function isPartiallyDelivered(order: { status?: string; partiallyDelivered?: boolean; items?: readonly SplitLine[] | null }): boolean {
  if (order.status === "delivered" || order.status === "cancelled" || order.status === "returned") return false;
  if (typeof order.partiallyDelivered === "boolean") return order.partiallyDelivered;
  const { delivered, coming } = splitLines(order.items);
  return delivered.length > 0 && coming.length > 0;
}

/**
 * The text of a customer leg's cargo, "1 × Kettle, 2 × Lamp". Legs from the customer's view carry `{ orderItemId, qty }` only;
 * the name comes from the order's own line, or from the leg item when it has one (the staff views).
 */
export function legCargoText(
  items: readonly { orderItemId?: string; name?: string | null; nameFr?: string | null; qty: number }[] | null | undefined,
  lines: readonly { id?: string; name: string }[],
  fr: boolean,
): string {
  return (items ?? [])
    .map((it) => {
      const own = (fr ? it.nameFr || it.name : it.name || it.nameFr) ?? "";
      const name = own.trim() || lines.find((l) => l.id && l.id === it.orderItemId)?.name || "";
      return name ? `${it.qty} × ${name}` : `${it.qty} ×`;
    })
    .join(", ");
}

/** The legs that bring parcels to the customer (the warehouse's delivery, or an express run), oldest first. */
export function customerLegs<T extends SplitLeg>(legs: readonly T[] | null | undefined): T[] {
  return (legs ?? []).filter((l) => !!l.kind && CUSTOMER_LEG_KINDS.includes(l.kind)).sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
}

/** The customer leg that is on the road right now (picked up or on the way), if any. */
export function openCustomerLeg<T extends SplitLeg>(legs: readonly T[] | null | undefined): T | null {
  return customerLegs(legs).find((l) => l.status === "picked_up" || l.status === "in_transit") ?? null;
}

/** More than one delivery for this order (a split), or a single one that carries only part of it. */
export function hasSplitLegs(legs: readonly SplitLeg[] | null | undefined): boolean {
  const c = customerLegs(legs).filter((l) => l.status !== "failed");
  return c.length > 1 || c.some((l) => l.completesOrder === false);
}

/** An express order: the server's `deliveryMode`, else an express leg in the tracking. */
export function isExpressOrder(order: { deliveryMode?: string | null; tracking?: { legs?: readonly SplitLeg[] | null } | null }): boolean {
  if (order.deliveryMode) return order.deliveryMode === "express";
  return (order.tracking?.legs ?? []).some((l) => l.kind === "express");
}

export const EXPRESS_LABEL = { en: "Express", fr: "Express" };
export const EXPRESS_HINT = {
  en: "A rider brings it straight from the seller to you",
  fr: "Un livreur l'apporte directement du vendeur chez vous",
};

export type Audience = "customer" | "seller" | "staff";

/** The banner words, by who reads them (the customer, a seller about their own parcel, or ops staff). */
export function partialTitle(audience: Audience, fr: boolean): string {
  if (audience === "customer") return fr ? "Une partie de votre commande a été livrée" : "Part of your order was delivered";
  if (audience === "seller") return fr ? "Votre colis a été livré" : "Your package was delivered";
  return fr ? "Une partie de la commande a été livrée" : "Part of this order was delivered";
}

export function partialHint(audience: Audience, fr: boolean): string {
  if (audience === "customer") return fr ? "Le reste arrive dès que les autres colis sont prêts." : "The rest is coming as soon as the other parcels are ready.";
  if (audience === "seller") return fr ? "Les colis des autres vendeurs de cette commande sont encore en route." : "The other sellers' parcels on this order are still on their way.";
  return fr ? "Le reste suivra dans une autre livraison." : "The rest follows in another delivery.";
}

/** One line as the panel prints it: the name is already in the reader's language. */
export interface PanelLine extends SplitLine {
  /** The order line's id: a customer leg lists its lines as `{ orderItemId, qty }` only, so names are looked up here. */
  id?: string;
  name: string;
  qty: number;
}
