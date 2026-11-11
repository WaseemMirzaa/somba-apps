/**
 * What the fraud page shows for an alert: the rule's name and the reason the server stored (English and French).
 * Alerts from before the reasons existed have none, and say so.
 */
export const FRAUD_TYPE_LABEL: Record<string, { en: string; fr: string }> = {
  failed_payments: { en: "Failed payments", fr: "Paiements échoués" },
  new_account_orders: { en: "New account, many orders", fr: "Compte récent, nombreuses commandes" },
  shared_identity: { en: "Shared phone or device", fr: "Téléphone ou appareil partagé" },
  return_rate: { en: "High return rate", fr: "Taux de retours élevé" },
  address_changes: { en: "Address changes", fr: "Changements d'adresse" },
  // Older rows
  otp_fail: { en: "OTP fail", fr: "Échec OTP" },
  velocity: { en: "Velocity", fr: "Vélocité" },
  address_block: { en: "Address block", fr: "Blocage d'adresse" },
};

export function fraudTypeLabel(type: string, fr: boolean): string {
  const l = FRAUD_TYPE_LABEL[type];
  return l ? (fr ? l.fr : l.en) : type.replace(/_/g, " ");
}

/** The reason in the viewer's language; French falls back to English when the row has no French. */
export function fraudReason(alert: { reason?: string | null; reasonFr?: string | null }, fr: boolean): string {
  const text = (fr ? alert.reasonFr || alert.reason : alert.reason) ?? "";
  return text.trim() || (fr ? "Raison non enregistrée (alerte ancienne)" : "No reason recorded (older alert)");
}
