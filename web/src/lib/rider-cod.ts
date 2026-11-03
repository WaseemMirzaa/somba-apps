/**
 * Cash on delivery in the rider portal. COD is not offered (the public setting `codEnabled` is "false"), so nothing about
 * cash shows up for a rider unless an administrator switches it on. Pure functions; the hook that reads the setting is
 * `useCodEnabled` in `lib/rider.ts`. The Flutter rider app follows the same rules (`rider-app/lib/services/cod_visibility.dart`).
 *
 * No imports: `npm test` loads this file on its own.
 */

/** The public setting as the API sends it: the text "true" or "false" (or a real boolean from an older build). */
export function parseCodEnabled(raw: unknown): boolean {
  return raw === true || String(raw).trim().toLowerCase() === "true";
}

/** The cash card, the hand-over receipts and the cash note: only while COD is on. */
export function showCashSummary(codEnabled: boolean): boolean {
  return codEnabled;
}

/**
 * Cash on one task: the "COD" badge and the cash field when the rider confirms the delivery. Normally only while COD is on.
 * The one exception is a task that still has cash due (it was placed while COD was on): the server will not complete it
 * without the amount, so the rider must see and enter it.
 */
export function showTaskCash(codEnabled: boolean, task: { codAmount: number; status: string }): boolean {
  if (codEnabled) return task.codAmount > 0;
  return task.codAmount > 0 && task.status !== "delivered" && task.status !== "failed";
}

/** The payment label of an order: a COD order never reads "Cash on delivery" to a rider while COD is off, unless cash is still due. */
export function riderPaymentLabel(codEnabled: boolean, method: string, label: string, task: { codAmount: number; status: string }): string {
  if (method !== "cod") return label;
  return showTaskCash(codEnabled, task) || codEnabled ? label : "—";
}
