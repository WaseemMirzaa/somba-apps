/**
 * Cash on delivery is not offered unless the platform setting `codEnabled` is exactly "true" (it is false in production).
 * The code stays (it is tested), but nothing COD-related is shown to customers, riders, sellers or staff while it is off:
 * pages hide their COD lines, columns and menu entries with these helpers. The server refuses COD orders by itself.
 */

/** Is COD offered? Only the literal `true` (or the string "true") counts; unset, "false", loading and errors all mean no. */
export function codOffered(value: unknown): boolean {
  return value === true || value === "true";
}

/** Drop the entries marked `cod: true` while COD is not offered (menus, quick links, tiles). */
export function withoutCodWhenOff<T extends { cod?: boolean }>(items: readonly T[], offered: boolean): T[] {
  return offered ? [...items] : items.filter((i) => !i.cod);
}

/** The payment methods a picker or filter lists: `cod` is left out while COD is not offered. */
export function withoutCodMethod<T extends string>(ids: readonly T[], offered: boolean): T[] {
  return offered ? [...ids] : ids.filter((id) => id !== "cod");
}
