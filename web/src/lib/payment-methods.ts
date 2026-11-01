/**
 * The payment methods an order or a payment can carry, named in both languages: ONE map for the whole web app.
 * The ids are the API's (`orders.paymentMethod`, `payments.method`). Every page that prints a method goes through
 * `paymentMethodLabel`, so a method added here is translated everywhere and none is left in English in the French UI.
 */

export type PaymentMethodId = "wallet" | "airtel_money" | "orange_money" | "vodacom_mpesa" | "stripe_card" | "cod";

export const PAYMENT_METHODS: Record<PaymentMethodId, { en: string; fr: string }> = {
  wallet: { en: "Somba wallet", fr: "Portefeuille Somba" },
  airtel_money: { en: "Airtel Money", fr: "Airtel Money" },
  orange_money: { en: "Orange Money", fr: "Orange Money" },
  vodacom_mpesa: { en: "Vodacom M-Pesa", fr: "Vodacom M-Pesa" },
  stripe_card: { en: "Card", fr: "Carte" },
  cod: { en: "Cash on delivery", fr: "Paiement à la livraison" },
};

/** The ids in the order a picker lists them. */
export const PAYMENT_METHOD_IDS = Object.keys(PAYMENT_METHODS) as PaymentMethodId[];

/** Older code stored display names ("COD", "Card", "Wallet") instead of ids: read them as the method they stand for. */
const ALIASES: Record<string, PaymentMethodId> = { cod: "cod", card: "stripe_card", wallet: "wallet" };

/** The method behind an API id (or an older display name), or null when it is none of ours. */
export function paymentMethodId(method: string | null | undefined): PaymentMethodId | null {
  const raw = (method ?? "").trim();
  if (raw in PAYMENT_METHODS) return raw as PaymentMethodId;
  return ALIASES[raw.toLowerCase()] ?? null;
}

/** "Portefeuille Somba" / "Somba wallet" for `wallet`. A method we do not know is shown readable, as it came. */
export function paymentMethodLabel(method: string | null | undefined, fr: boolean): string {
  const id = paymentMethodId(method);
  if (id) return fr ? PAYMENT_METHODS[id].fr : PAYMENT_METHODS[id].en;
  const raw = (method ?? "").trim();
  return raw ? raw.replace(/_/g, " ") : "—";
}
