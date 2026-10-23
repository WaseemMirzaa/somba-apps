import { BadRequestException } from '@nestjs/common';

/**
 * Product options a shopper chooses before buying, e.g. Size (39…45) and Colour (Black, White).
 * Stock is shared by all combinations (per-combination stock is a later step).
 * The chosen combination travels as a label: "Size: 42 · Colour: Black" ("Default" when the product has none).
 */
export interface VariantGroup {
  name: string;
  options: string[];
}

export const MAX_GROUPS = 2;
export const MAX_OPTIONS = 20;
export const DEFAULT_VARIANT = 'Default';
const SEP = ' · ';

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Validates what a seller sent; returns the normalised groups (empty array = no options). */
export function parseVariantGroups(raw: unknown): VariantGroup[] {
  if (raw === null || raw === undefined || raw === '') return [];
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Product options are not valid.');
    }
  }
  if (!Array.isArray(value)) throw new BadRequestException('Product options are not valid.');
  if (value.length > MAX_GROUPS) throw new BadRequestException(`At most ${MAX_GROUPS} option types (e.g. size and colour).`);
  const groups: VariantGroup[] = [];
  const names = new Set<string>();
  for (const g of value) {
    const name = clean((g as VariantGroup)?.name, 30);
    const options = Array.isArray((g as VariantGroup)?.options) ? (g as VariantGroup).options.map((o) => clean(o, 30)).filter(Boolean) : [];
    if (!name && options.length === 0) continue;
    if (!name) throw new BadRequestException('Give each option type a name, e.g. "Size".');
    if (names.has(name.toLowerCase())) throw new BadRequestException(`"${name}" is listed twice.`);
    if (options.length === 0) throw new BadRequestException(`Add at least one value for "${name}".`);
    if (options.length > MAX_OPTIONS) throw new BadRequestException(`At most ${MAX_OPTIONS} values for "${name}".`);
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new BadRequestException(`"${name}" has the same value twice.`);
    if ([name, ...options].some((s) => s.includes(':') || s.includes('·'))) throw new BadRequestException('Option names and values cannot contain ":" or "·".');
    names.add(name.toLowerCase());
    groups.push({ name, options });
  }
  return groups;
}

/** Reads the stored column (JSON text) without throwing: a broken value counts as "no options". */
export function storedVariantGroups(raw: string | null | undefined): VariantGroup[] {
  try {
    return parseVariantGroups(raw ?? null);
  } catch {
    return [];
  }
}

export function variantLabel(picks: { name: string; value: string }[]): string {
  return picks.length === 0 ? DEFAULT_VARIANT : picks.map((p) => `${p.name}: ${p.value}`).join(SEP);
}

/**
 * The label a buyer sent, checked against the product's options: every group must be chosen, with a real value.
 * Returns the canonical label, or throws a message the shopper can act on.
 */
export function checkVariant(groups: VariantGroup[], label: unknown, productName: string): string {
  const raw = clean(label, 200);
  if (groups.length === 0) return DEFAULT_VARIANT;
  const picks = new Map<string, string>();
  for (const part of raw.split(SEP)) {
    const i = part.indexOf(':');
    if (i > 0) picks.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim());
  }
  const out: { name: string; value: string }[] = [];
  for (const g of groups) {
    const value = picks.get(g.name.toLowerCase());
    const match = value ? g.options.find((o) => o.toLowerCase() === value.toLowerCase()) : undefined;
    if (!match) throw new BadRequestException(`Choose a ${g.name.toLowerCase()} for "${productName}".`);
    out.push({ name: g.name, value: match });
  }
  return variantLabel(out);
}
