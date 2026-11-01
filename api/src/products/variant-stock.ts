import { BadRequestException } from '@nestjs/common';
import { DEFAULT_VARIANT, checkVariant, variantLabel } from '../common/variants/variants';
import type { VariantGroup } from '../common/variants/variants';

/**
 * Stock split by option ("Size: 42 · Colour: Black"), kept next to the product's total.
 *
 *   stock         units on hand in total
 *   variantStock  units set aside for the options listed there
 *   pool          stock - sum(variantStock): shared by every option that has no entry
 *
 * So a product with no `variantStock` behaves exactly as before (everything is the pool), and an option the seller
 * never listed still sells from whatever the entries left over. A sale of an option with an entry takes from the
 * entry and from the total; a sale of an option without one takes from the total (the pool) only.
 */
export type StockEntries = Record<string, number> | null;

export const sumEntries = (entries: StockEntries): number => (entries ? Object.values(entries).reduce((t, n) => t + n, 0) : 0);

/** Units no option has claimed. */
export const poolOf = (stock: number, entries: StockEntries): number => Math.max(0, stock - sumEntries(entries));

/** Units a shopper can still buy of one option. */
export function availableFor(stock: number, entries: StockEntries, label: string | null | undefined): number {
  if (entries && label && Object.prototype.hasOwnProperty.call(entries, label)) return entries[label];
  return poolOf(stock, entries);
}

export type StockPlan =
  | { ok: true; stock: number; entries: StockEntries; touchedEntry: boolean }
  | { ok: false; available: number };

/**
 * What a change of `delta` units (negative = take) of one option does to the product's numbers, or why it cannot be
 * done (`available` = what there is). Pure: the caller applies the result atomically.
 */
export function planChange(stock: number, entries: StockEntries, label: string | null | undefined, delta: number): StockPlan {
  const has = !!entries && !!label && Object.prototype.hasOwnProperty.call(entries, label);
  const available = availableFor(stock, entries, label);
  if (delta < 0 && available < -delta) return { ok: false, available };
  if (has && entries && label) return { ok: true, stock: stock + delta, entries: { ...entries, [label]: entries[label] + delta }, touchedEntry: true };
  return { ok: true, stock: stock + delta, entries, touchedEntry: false };
}

/** Every option label a product's option groups can produce ("Default" when there are none). */
export function allLabels(groups: VariantGroup[]): string[] {
  if (!groups.length) return [DEFAULT_VARIANT];
  let combos: { name: string; value: string }[][] = [[]];
  for (const g of groups) combos = combos.flatMap((c) => g.options.map((o) => [...c, { name: g.name, value: o }]));
  return combos.map((c) => variantLabel(c));
}

/**
 * What a seller sent as per-option stock, checked against the product's options: every key must be a real option
 * combination (written in any case, stored canonically) and every value a whole number of units. Null / empty
 * clears the split. Throws a message the seller can act on.
 */
export function cleanVariantStock(raw: unknown, groups: VariantGroup[], productName = 'this product'): StockEntries {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Stock per option is not valid.');
  const entries = Object.entries(raw as Record<string, unknown>);
  if (!entries.length) return null;
  if (!groups.length) throw new BadRequestException('Add product options (size, colour…) before setting stock per option.');
  const out: Record<string, number> = {};
  for (const [key, value] of entries) {
    const label = checkVariant(groups, key, productName);
    const n = typeof value === 'number' ? value : Number(value);
    if (value === '' || value === null || !Number.isInteger(n) || n < 0 || n > 1_000_000) {
      throw new BadRequestException(`Stock for "${label}" must be a whole number from 0 to 1,000,000.`);
    }
    if (label in out) throw new BadRequestException(`"${label}" is listed twice.`);
    out[label] = n;
  }
  return out;
}

/** Keep only the entries whose option still exists (after the seller changed the product's options). */
export function pruneEntries(entries: StockEntries, groups: VariantGroup[]): StockEntries {
  if (!entries) return null;
  if (!groups.length) return null;
  const valid = new Set(allLabels(groups));
  const out = Object.fromEntries(Object.entries(entries).filter(([k]) => valid.has(k)));
  return Object.keys(out).length ? out : null;
}

/**
 * The product's total after a seller set `variantStock`. An explicit `stock` wins (and must cover the entries);
 * otherwise the pool the product had is kept on top of the new entries (when every option is listed it is 0).
 */
export function deriveStock(opts: { oldStock: number; oldEntries: StockEntries; entries: StockEntries; explicit?: number }): number {
  // Clearing the split leaves the total as it was.
  if (!opts.entries) return opts.explicit ?? opts.oldStock;
  const sum = sumEntries(opts.entries);
  if (opts.explicit !== undefined) {
    if (opts.explicit < sum) {
      throw new BadRequestException(`Total stock (${opts.explicit}) is below the stock set per option (${sum}).`);
    }
    return opts.explicit;
  }
  return sum + poolOf(opts.oldStock, opts.oldEntries);
}
