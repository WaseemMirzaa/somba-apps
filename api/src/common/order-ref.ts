/**
 * Order references are `KOM-…`. Orders placed before the rename were `SOM-…` (the migration `OrderRefsKom1793570000001` rewrites every stored
 * one), but people still hold the old text: a printed label, a screenshot, an old message. Every place that looks an order up by its reference
 * runs the typed or scanned text through `normalizeOrderRef` first, so `SOM-12345` finds `KOM-12345`.
 */
export const ORDER_REF_PREFIX = 'KOM-';

/** A reference-looking `SOM-` + id character, at the start or after a non-word character (so `SOMBA10` and `AWESOM-1` are left alone). */
const OLD_REF = /(^|[^A-Za-z0-9])som-(?=[0-9A-Za-z])/gi;

/** Rewrites every old `SOM-…` reference in `text` to `KOM-…`. Anything else is returned unchanged. */
export function normalizeOrderRef(text: string): string {
  return text.replace(OLD_REF, '$1' + ORDER_REF_PREFIX);
}
