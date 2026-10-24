/**
 * Product options (e.g. Size and Colour). Mirrors api/src/common/variants/variants.ts: the chosen combination
 * travels as a label "Size: 42 · Colour: Black", or "Default" when the product has no options.
 */
export interface VariantGroup {
  name: string;
  options: string[];
}

/** Display-only labels of the option groups, index-aligned with `variants` (the purchase keys never change). */
export interface VariantLabels {
  en: VariantGroup[];
  fr: VariantGroup[];
}

export const MAX_GROUPS = 2;
export const MAX_OPTIONS = 20;
export const DEFAULT_VARIANT = "Default";

/** Accepts the API value (JSON text or array); anything malformed reads as "no options". */
export function readVariants(raw: unknown): VariantGroup[] {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((g) => ({
      name: String((g as VariantGroup)?.name ?? "").trim(),
      options: Array.isArray((g as VariantGroup)?.options) ? (g as VariantGroup).options.map((o) => String(o).trim()).filter(Boolean) : [],
    }))
    .filter((g) => g.name && g.options.length > 0);
}

/** Accepts the API's `variantLabels` (object or JSON text); anything malformed reads as "no labels". */
export function readVariantLabels(raw: unknown): VariantLabels | null {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const read = (x: unknown): VariantGroup[] =>
    Array.isArray(x)
      ? x.map((g) => ({
          name: String((g as VariantGroup)?.name ?? "").trim(),
          options: Array.isArray((g as VariantGroup)?.options) ? (g as VariantGroup).options.map((q) => String(q).trim()) : [],
        }))
      : [];
  const en = read(o.en);
  const fr = read(o.fr);
  return en.length || fr.length ? { en, fr } : null;
}

export function variantLabel(groups: VariantGroup[], picks: Record<string, string>): string {
  if (groups.length === 0) return DEFAULT_VARIANT;
  return groups.map((g) => `${g.name}: ${picks[g.name] ?? ""}`).join(" · ");
}

/** The first group the shopper has not picked yet (null when the choice is complete). */
export function missingPick(groups: VariantGroup[], picks: Record<string, string>): VariantGroup | null {
  return groups.find((g) => !picks[g.name] || !g.options.includes(picks[g.name])) ?? null;
}
