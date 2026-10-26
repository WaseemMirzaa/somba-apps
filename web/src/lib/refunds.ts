/**
 * What a payment has already given back, and how much of it is left to refund: ONE reading for the admin Refunds page,
 * the order page, the refund dialog and the finance table, so no screen offers a refund the server would refuse.
 *
 * The server caps every refund at (amount paid - already refunded) on every path (admin refund, return, dispute,
 * cancellation, seller cancel) and records each in the refund ledger; these helpers only show that figure and the
 * reason when there is nothing (or less) left. Pure: `npm test` loads this file on its own.
 */

export interface RefundablePayment {
  amountUsd: number;
  status: string;
  /** The running total of its refunds (`payments.refundedUsd`). */
  refundedUsd?: number | null;
  /** What the server says can still be refunded (absent on an older server: worked out here). */
  refundableUsd?: number | null;
}

export type RefundState = "unpaid" | "none" | "partial" | "full";

export interface RefundFigures {
  state: RefundState;
  refundedUsd: number;
  refundableUsd: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function refundFigures(p: RefundablePayment): RefundFigures {
  const amount = p.amountUsd ?? 0;
  if (p.status === "refunded") return { state: "full", refundedUsd: Math.max(cents(p.refundedUsd ?? 0), cents(amount)), refundableUsd: 0 };
  if (p.status !== "succeeded") return { state: "unpaid", refundedUsd: 0, refundableUsd: 0 };
  const refunded = cents(Math.max(0, p.refundedUsd ?? 0));
  const left = typeof p.refundableUsd === "number" ? cents(Math.max(0, p.refundableUsd)) : cents(Math.max(0, amount - refunded));
  if (left < 0.01) return { state: refunded > 0 ? "full" : "none", refundedUsd: refunded, refundableUsd: 0 };
  return { state: refunded > 0 ? "partial" : "none", refundedUsd: refunded, refundableUsd: left };
}

/**
 * Why "Authorise refund" is limited or off, in the viewer's language; null when the whole payment is still refundable.
 * `money` formats an amount ("$63.00").
 */
export function refundNote(p: RefundablePayment, fr: boolean, money: (n: number) => string): string | null {
  const f = refundFigures(p);
  if (f.state === "unpaid") return fr ? "Seul un paiement abouti peut être remboursé." : "Only a completed payment can be refunded.";
  if (f.state === "full") {
    return fr
      ? `Rien à rembourser : ${money(f.refundedUsd)} sur ${money(p.amountUsd)} ont déjà été remboursés.`
      : `Nothing left to refund: ${money(f.refundedUsd)} of ${money(p.amountUsd)} already went back to the customer.`;
  }
  if (f.state === "partial") {
    return fr
      ? `${money(f.refundedUsd)} sur ${money(p.amountUsd)} déjà remboursés : au plus ${money(f.refundableUsd)} peuvent encore l'être.`
      : `${money(f.refundedUsd)} of ${money(p.amountUsd)} already refunded: at most ${money(f.refundableUsd)} can still be refunded.`;
  }
  return null;
}

/** One refund of the ledger (`payments:refunds`). */
export interface RefundEntry {
  id: string;
  paymentId: string;
  paymentReference?: string | null;
  method?: string | null;
  orderId?: string | null;
  orderReference?: string | null;
  amountUsd: number;
  refundTo: "wallet" | "phone";
  status: "completed" | "sending" | "failed";
  refundRef?: string | null;
  kind: "admin" | "cancellation" | "return" | "dispute" | "seller_cancel" | "late_payment" | "legacy";
  disputeId?: string | null;
  disputeReference?: string | null;
  memo?: string | null;
  createdAt: string;
}

/** The ledger rows of each payment, newest first. */
export function refundsByPayment(entries: readonly RefundEntry[] | null | undefined): Map<string, RefundEntry[]> {
  const out = new Map<string, RefundEntry[]>();
  for (const e of entries ?? []) out.set(e.paymentId, [...(out.get(e.paymentId) ?? []), e]);
  for (const list of out.values()) list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

const KIND: Record<RefundEntry["kind"], { en: string; fr: string }> = {
  admin: { en: "Refund by finance", fr: "Remboursement par la finance" },
  cancellation: { en: "Order cancelled", fr: "Commande annulée" },
  return: { en: "Return", fr: "Retour" },
  dispute: { en: "Dispute", fr: "Litige" },
  seller_cancel: { en: "Items cancelled by the seller", fr: "Articles annulés par le vendeur" },
  late_payment: { en: "Late payment kept in the wallet", fr: "Paiement tardif crédité au portefeuille" },
  legacy: { en: "Earlier refund", fr: "Remboursement antérieur" },
};

/** Why it was refunded: "Return RET-0001", "Order cancelled"... A return or a dispute is named by its reference. */
export function refundReason(e: Pick<RefundEntry, "kind" | "disputeReference">, fr: boolean): string {
  const base = KIND[e.kind] ?? KIND.legacy;
  const label = fr ? base.fr : base.en;
  return (e.kind === "return" || e.kind === "dispute") && e.disputeReference ? `${label} ${e.disputeReference}` : label;
}

/** Where it went: "to wallet", "to phone · sending", "wallet (phone refund failed)". */
export function refundDestination(e: Pick<RefundEntry, "refundTo" | "status">, fr: boolean): string {
  if (e.refundTo === "phone") {
    return e.status === "sending" ? (fr ? "vers le téléphone · en cours" : "to phone · sending") : fr ? "vers le téléphone" : "to phone";
  }
  return e.status === "failed" ? (fr ? "portefeuille (échec téléphone)" : "wallet (phone refund failed)") : fr ? "vers le portefeuille" : "to wallet";
}
