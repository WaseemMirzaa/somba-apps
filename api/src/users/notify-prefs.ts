/**
 * Per-category notification switches (a seller's Settings page: "tell me about orders, stock, reviews…").
 * A category that is off still saves the notice in the bell; it only stops the push to the phone / browser.
 */
export const NOTIFY_CATEGORIES = ['order', 'payout', 'stock', 'review', 'question', 'message', 'product', 'promo'] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];
export type NotifyPrefs = Record<NotifyCategory, boolean>;

export const DEFAULT_NOTIFY: NotifyPrefs = {
  order: true,
  payout: true,
  stock: true,
  review: true,
  question: true,
  message: true,
  product: true,
  promo: true,
};

/** The category a saved notice belongs to (by its `type`), or null for notices that cannot be switched off (security, system). */
export function noticeCategory(type: string | null | undefined): NotifyCategory | null {
  switch (type) {
    case 'order':
    case 'delivery':
    case 'dispute':
    case 'return':
    case 'exchange':
    case 'replacement':
      return 'order';
    case 'payout':
    case 'finance':
      return 'payout';
    case 'stock':
      return 'stock';
    case 'review':
      return 'review';
    case 'question':
      return 'question';
    case 'chat':
    case 'support':
      return 'message';
    case 'moderation':
    case 'product':
      return 'product';
    case 'campaign':
    case 'flash':
    case 'promo':
    case 'marketing':
      return 'promo';
    default:
      return null;
  }
}

export function parseNotify(raw: unknown): NotifyPrefs {
  const out = { ...DEFAULT_NOTIFY };
  if (raw && typeof raw === 'object') {
    for (const k of NOTIFY_CATEGORIES) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}
