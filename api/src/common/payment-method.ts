/**
 * How a payment method is named in text people read (notices, wallet history lines). The ids (`airtel_money`…) are
 * data and stay in the database; they never go into a sentence.
 */
const LABELS: Record<string, string> = {
  airtel_money: 'Airtel Money',
  orange_money: 'Orange Money',
  vodacom_mpesa: 'Vodacom M-Pesa',
  stripe_card: 'Card',
  card: 'Card',
  cod: 'Cash on delivery',
  wallet: 'Wallet',
};

/** "airtel_money" -> "Airtel Money". A method we do not know is spelled out ("some_new_network" -> "Some New Network"). */
export function paymentMethodLabel(id: string | null | undefined): string {
  const key = String(id ?? '').trim();
  return LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Compare ids and display names alike: "Vodacom M-Pesa", "vodacom_mpesa" and "vodacom mpesa" are one method. */
export const methodKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The id behind an id or an English display name, or null when it is neither. */
export function paymentMethodId(idOrLabel: string): string | null {
  const k = methodKey(idOrLabel);
  for (const id of Object.keys(LABELS)) if (methodKey(id) === k || methodKey(LABELS[id]) === k) return id;
  return null;
}
