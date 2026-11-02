/**
 * A cash amount typed in a field: dollars and cents, a comma or a point as the decimal mark. Returns the amount, or null
 * when it is empty, not a number, zero or negative, or has more than two decimals. The server checks again.
 */
export function parseCashAmount(raw: string): number | null {
  const n = Number(String(raw ?? "").trim().replace(",", "."));
  if (!String(raw ?? "").trim() || !Number.isFinite(n) || n <= 0) return null;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return null;
  return Math.round(n * 100) / 100;
}
