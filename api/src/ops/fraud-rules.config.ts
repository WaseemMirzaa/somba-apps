/**
 * The fraud rules' thresholds. They are platform settings (admin settings page, `settings:set`); these are the defaults
 * used when a setting is missing, and the range each one is validated against. Pure data, shared by the rules and the
 * settings validation.
 */
export interface FraudThreshold {
  key: string;
  default: number;
  min: number;
  max: number;
}

export const FRAUD_THRESHOLDS = {
  /** Failed payment attempts by one account in 24 hours: at or above this raises an alert. */
  failedPayments: { key: 'fraudFailedPayments24h', default: 5, min: 2, max: 100 },
  /** Orders placed in 24 hours by a brand-new account: at or above this raises an alert. */
  newAccountOrders: { key: 'fraudNewAccountOrders24h', default: 3, min: 2, max: 100 },
  /** How long an account counts as brand new (days since it was created). */
  newAccountDays: { key: 'fraudNewAccountDays', default: 7, min: 1, max: 90 },
  /** Accounts that share one phone number or one device: at or above this raises an alert. */
  sharedAccounts: { key: 'fraudSharedAccounts', default: 3, min: 2, max: 50 },
  /** Share (percent) of the orders of the last 30 days that were returned, disputed or refunded: at or above this raises an alert. */
  returnRatePct: { key: 'fraudReturnRatePct', default: 50, min: 1, max: 100 },
  /** Fewest orders in the 30 days before the return rate is judged at all (one return out of one order is not a pattern). */
  returnMinOrders: { key: 'fraudReturnMinOrders', default: 3, min: 1, max: 100 },
  /** Delivery address changes in 24 hours while an order was still on its way: at or above this raises an alert. */
  addressChanges: { key: 'fraudAddressChanges24h', default: 3, min: 2, max: 100 },
} as const satisfies Record<string, FraudThreshold>;

export type FraudThresholdName = keyof typeof FRAUD_THRESHOLDS;

/** The setting keys, for the settings whitelist. */
export const FRAUD_SETTING_KEYS: readonly string[] = Object.values(FRAUD_THRESHOLDS).map((t) => t.key);

export const FRAUD_ALERT_TYPES = ['cod_risk', 'failed_payments', 'new_account_orders', 'shared_identity', 'return_rate', 'address_changes'] as const;
export type FraudAlertType = (typeof FRAUD_ALERT_TYPES)[number];
