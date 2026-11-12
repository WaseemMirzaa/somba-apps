/**
 * Pure rules of the shop cart's account sync (kept out of the React context so they can be tested).
 *
 * A cart lives in this browser (so a guest can shop) AND on the account (the website and the app share it). When someone
 * signs in the two are merged, and when they sign out this browser's copy is dropped, so the next person who uses the
 * browser does not inherit it (the account keeps its own copy and brings it back at the next sign-in).
 */

export type MergeableLine = { id: string; variant: string; qty: number };

/** Local lines + the account's lines: one line per product and option, the larger quantity wins. Local order first. */
export function mergeCartLines<T extends MergeableLine>(local: readonly T[], remote: readonly T[]): T[] {
  const byKey = new Map(local.map((c) => [`${c.id}|${c.variant}`, c]));
  for (const r of remote) {
    const k = `${r.id}|${r.variant}`;
    const mine = byKey.get(k);
    if (!mine || r.qty > mine.qty) byKey.set(k, r);
  }
  return [...byKey.values()];
}

/**
 * The signed-in customer went from `previous` to `current` (account ids, null = nobody). True when the browser's cart
 * belonged to an account that has just signed out. A guest who never signed in keeps their cart; a signed-in session
 * that merely lost its connection for a moment keeps the account id, so it never counts as a sign-out.
 */
export function signedOut(previous: string | null, current: string | null): boolean {
  return previous !== null && current === null;
}
