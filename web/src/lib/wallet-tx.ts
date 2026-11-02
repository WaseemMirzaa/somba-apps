/** Wallet ledger wording for the read-only wallet panel on the customer page. */
const TYPE_LABELS: Record<string, { en: string; fr: string }> = {
  topup: { en: "Top-up", fr: "Recharge" },
  credit: { en: "Credit", fr: "Crédit" },
  cashback: { en: "Cashback", fr: "Cashback" },
  refund: { en: "Refund", fr: "Remboursement" },
  debit: { en: "Payment", fr: "Paiement" },
};

export function walletTypeLabel(type: string, fr: boolean): string {
  const l = TYPE_LABELS[type];
  return l ? (fr ? l.fr : l.en) : type;
}

/** Credits add to the balance, everything else subtracts (the server's rule). */
export function walletSigned(type: string, amount: number): number {
  return type === "debit" ? -Math.abs(amount) : Math.abs(amount);
}
