/**
 * When the customer's 4-digit handover code is worth asking for, and what the order page says about a failed attempt.
 *
 * The server (`orders:deliveryCode`) returns the code only while a customer leg is open and answers `required: false` /
 * null otherwise, so the page asks whenever the order is not over: a failed attempt sends the order back to `confirmed`
 * and re-opens the leg, and that retry has a fresh code. No runtime imports: `npm test` loads this file on its own.
 */

/** Statuses in which the order is not over, so a handover code may exist (unpaid `pending`, `cancelled`, `returned`, `delivered` never). */
export function hasDeliveryCodeStage(status: string): boolean {
  return !["pending", "cancelled", "returned", "delivered"].includes(status);
}

interface KeyLeg {
  id?: string;
  status?: string;
  updatedAt?: string | null;
  deliveredAt?: string | null;
}

/**
 * A string that changes whenever the code may have changed: the order's status, a leg that was added, updated or delivered.
 * The code is fetched again each time it changes, not only when the status does.
 */
export function codeRefreshKey(order: { status?: string; partiallyDelivered?: boolean; tracking?: { legs?: readonly KeyLeg[] | null } | null } | null | undefined): string {
  if (!order) return "";
  const legs = (order.tracking?.legs ?? []).map((l) => `${l.id ?? ""}:${l.status ?? ""}:${l.updatedAt ?? ""}:${l.deliveredAt ?? ""}`).join("|");
  return `${order.status ?? ""}/${order.partiallyDelivered ? 1 : 0}/${legs}`;
}

interface AttemptLeg {
  id?: string;
  kind?: string;
  status?: string;
  createdAt?: string;
  attempts?: number;
  failureReason?: string | null;
}

/** Reasons that close a leg without a delivery attempt behind them (the parcel went back, or the order was refunded). */
const NOT_AN_ATTEMPT = ["returned to seller", "refunded"];

/**
 * The failed delivery attempt the customer should hear about: the latest failed customer leg (delivery or express) of an order
 * that is not over, whether or not the rider is coming back (`retry`).
 */
export function failedAttempt(
  order: { status?: string; tracking?: { legs?: readonly AttemptLeg[] | null } | null } | null | undefined,
): { attempt: number; reason: string | null; retry: boolean } | null {
  if (!order || !hasDeliveryCodeStage(order.status ?? "")) return null;
  const customer = (order.tracking?.legs ?? [])
    .filter((l) => l.kind === "delivery" || l.kind === "express")
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  const failed = customer.filter((l) => l.status === "failed" && !NOT_AN_ATTEMPT.includes((l.failureReason ?? "").trim().toLowerCase()));
  const last = failed[failed.length - 1];
  if (!last) return null;
  const later = customer.slice(customer.indexOf(last) + 1);
  return { attempt: last.attempts ?? failed.length, reason: last.failureReason?.trim() || null, retry: later.some((l) => l.status !== "failed") };
}

/** "Delivery attempt 1 failed: Customer not reachable. The rider will try again." */
export function failedAttemptText(a: { attempt: number; reason: string | null; retry: boolean }, fr: boolean): string {
  const head = fr ? `Tentative de livraison ${a.attempt} échouée` : `Delivery attempt ${a.attempt} failed`;
  const reason = (a.reason ?? "").trim().replace(/[.!?\s]+$/, "");
  const why = reason ? `: ${reason}` : "";
  const tail = a.retry ? (fr ? " Le livreur va réessayer." : " The rider will try again.") : fr ? " Nous vous contactons." : " We will be in touch.";
  return `${head}${why}.${tail}`;
}
