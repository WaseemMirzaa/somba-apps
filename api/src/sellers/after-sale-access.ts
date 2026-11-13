import type { CaseKind } from '../database/entities/case-seller-message.entity';

/**
 * Which read-only after-sale sections a store's portal shows (docs/contracts/admin-controls.md §13). Four sections, each with a
 * platform default (a staff-only setting) and an optional per-store override (`sellers.afterSaleAccess`, JSON).
 */
export const AFTER_SALE_KEYS = ['returns', 'exchanges', 'replacements', 'express', 'customerThread', 'reasons'] as const;
export type AfterSaleKey = (typeof AFTER_SALE_KEYS)[number];

/** The setting that holds each section's default ('true' | 'false'; missing = off). Staff-only: never in the public settings. */
export const AFTER_SALE_SETTING: Record<AfterSaleKey, string> = {
  returns: 'sellerViewReturns',
  exchanges: 'sellerViewExchanges',
  replacements: 'sellerViewReplacements',
  express: 'sellerViewExpress',
  /** The customer <-> support conversation of a case, read-only (only where the section is on). */
  customerThread: 'sellerViewCustomerThread',
  /** The customer's reason, description, photos and support's decision note on a case (only where the section is on). */
  reasons: 'sellerViewReasons',
};
export const AFTER_SALE_SETTING_KEYS: string[] = Object.values(AFTER_SALE_SETTING);

export type AfterSaleAccess = Record<AfterSaleKey, boolean>;
/** true / false = forced On / Off for this store, null or missing = follow the default. */
export type AfterSaleOverride = Partial<Record<AfterSaleKey, boolean | null>>;

/** Which section a case kind belongs to. */
export const SECTION_OF: Record<CaseKind, AfterSaleKey> = { return: 'returns', exchange: 'exchanges', replacement: 'replacements' };

export const OFF_FOR_STORE = 'This section is turned off for your store.';
export const NOT_SHARED = 'KOMORIKO support has not shared this conversation with your store.';

/** The stored JSON as an override object; anything malformed reads as "follow every default". */
export function parseOverride(raw: unknown): AfterSaleOverride {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: AfterSaleOverride = {};
  for (const k of AFTER_SALE_KEYS) {
    const x = (v as Record<string, unknown>)[k];
    if (x === true || x === false) out[k] = x;
  }
  return out;
}

/** The four defaults from the settings table (every section defaults to off). */
export function defaultsFrom(settings: Record<string, string | null | undefined>): AfterSaleAccess {
  const on = (k: AfterSaleKey) => settings[AFTER_SALE_SETTING[k]] === 'true';
  return { returns: on('returns'), exchanges: on('exchanges'), replacements: on('replacements'), express: on('express'), customerThread: on('customerThread'), reasons: on('reasons') };
}

/** What a store sees: its override where it has one, the default otherwise. */
export function resolveAccess(override: AfterSaleOverride, defaults: AfterSaleAccess): AfterSaleAccess {
  const pick = (k: AfterSaleKey) => (typeof override[k] === 'boolean' ? (override[k] as boolean) : defaults[k]);
  return { returns: pick('returns'), exchanges: pick('exchanges'), replacements: pick('replacements'), express: pick('express'), customerThread: pick('customerThread'), reasons: pick('reasons') };
}

/** Serialise an override for the column: only the keys that force a value; null when the store follows every default. */
export function overrideColumn(o: AfterSaleOverride): string | null {
  const keep: AfterSaleOverride = {};
  for (const k of AFTER_SALE_KEYS) if (typeof o[k] === 'boolean') keep[k] = o[k];
  return Object.keys(keep).length ? JSON.stringify(keep) : null;
}

/** The three fields a store view carries for the portal and for staff. */
export function accessFields(raw: unknown, defaults: AfterSaleAccess) {
  const override = parseOverride(raw);
  return { afterSaleAccess: resolveAccess(override, defaults), afterSaleAccessOverride: override, afterSaleAccessDefaults: defaults };
}
