import { createHash } from 'crypto';
import { storedVariantGroups } from '../common/variants/variants';
import type { VariantGroup } from '../common/variants/variants';
import type { TranslationEntityType } from '../database/entities';
import { shouldTranslate } from './never-translate';
import { LOCALES, isLocale, otherLocale } from './translator.provider';
import type { Locale } from './translator.provider';

/**
 * Pure rules of the translation design (docs/MULTILINGUAL-PLAN.md §2): which fields of which records are
 * translatable, how a write is planned (source language, author rows, clears), how served values are composed
 * from a record's own columns plus its `translations` rows, and what a machine still has to translate.
 * No database, no network: everything here is unit-tested in isolation.
 */

export interface FieldSpec {
  /** Column of the base row that holds the authored text (in the record's `sourceLang`). */
  column: string;
  /** Longest accepted text. */
  max: number;
  /** Label used in validation messages. */
  label: string;
  /** The title-like field: at least one language is required (C-I1). */
  primary?: boolean;
  /** Option groups stored as JSON text, translated as a unit. */
  json?: boolean;
}

/** Translatable fields of the records that carry an authored `sourceLang`. Seller / store NAMES are not in here: they are never translated. */
export const TRANSLATABLE: Partial<Record<TranslationEntityType, Record<string, FieldSpec>>> = {
  product: {
    name: { column: 'name', max: 200, label: 'Product title', primary: true },
    description: { column: 'description', max: 5000, label: 'Description' },
    variants: { column: 'variants', max: 4000, label: 'Options', json: true },
  },
  category: { name: { column: 'name', max: 100, label: 'Name', primary: true } },
  seller: {
    description: { column: 'description', max: 1000, label: 'Description' },
    returnsPolicy: { column: 'returnsPolicy', max: 2000, label: 'Returns policy' },
    shippingPolicy: { column: 'shippingPolicy', max: 2000, label: 'Shipping policy' },
  },
  campaign: { name: { column: 'name', max: 150, label: 'Campaign name', primary: true } },
  flash_sale: { title: { column: 'title', max: 150, label: 'Title', primary: true } },
  cms_block: {
    title: { column: 'title', max: 200, label: 'Title', primary: true },
    body: { column: 'body', max: 20000, label: 'Body' },
  },
  broadcast: {
    title: { column: 'title', max: 200, label: 'Title', primary: true },
    body: { column: 'body', max: 2000, label: 'Body' },
  },
};

export const specsOf = (type: TranslationEntityType): Record<string, FieldSpec> => TRANSLATABLE[type] ?? {};

/** sha1(sourceLang + "\n" + text): identifies exactly which source a machine row was made from. */
export function sourceHash(sourceLang: string, text: string): string {
  return createHash('sha1').update(`${sourceLang}\n${text}`).digest('hex');
}

/** The name a client sends for the French twin of a served field: name -> nameFr. */
export const frName = (field: string) => `${field}Fr`;

export interface RowLite {
  field: string;
  locale: string;
  value: string;
  origin: string;
  sourceLang: string | null;
  sourceHash: string | null;
}

const clean = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

// ── Writing ────────────────────────────────────────────────────────────────────────────────

/** What a client sent for one field: undefined = untouched, null / '' = cleared. */
export type FieldInput = Partial<Record<Locale, string | null>>;

export interface WriteState {
  sourceLang: Locale;
  /** The base columns now (field -> text in sourceLang). */
  base: Record<string, string | null>;
  /** Existing AUTHOR rows: field -> locale -> text. */
  authors: Record<string, Partial<Record<Locale, string>>>;
}

export interface WritePlan {
  sourceLang: Locale;
  /** New values for base columns (only the keys that change), keyed by FIELD. */
  base: Record<string, string | null>;
  /** Author rows to upsert. */
  authors: { field: string; locale: Locale; value: string }[];
  /** Rows (author or machine) to delete so a machine fills them again, or because they moved into the base column. */
  deletes: { field: string; locale: Locale }[];
  /** The source language changed (the title was cleared in the old source language). */
  flipped: boolean;
  /** At least one text the machine may need to translate changed. */
  touched: boolean;
}

export class MissingTitleError extends Error {}

/**
 * Plan one save of translatable text. Rules (plan §2.3):
 *  - create, only the English text given -> sourceLang en; only the French -> fr (the base column then holds French);
 *    both -> the client's sourceLang if sent, else en. The other language is saved as an author row.
 *  - update: text in the source language edits the base column; text in the other language is an author row the
 *    machine never overwrites; clearing a row deletes it so the machine fills it again.
 *  - the title cleared in the source language while the other language has one: the other language becomes the source.
 * Throws {@link MissingTitleError} when no language has a title (C-I1).
 */
export function planWrite(opts: {
  type: TranslationEntityType;
  create: boolean;
  state: WriteState | null;
  input: Record<string, FieldInput>;
  clientSourceLang?: unknown;
  missingTitle?: string;
}): WritePlan {
  const specs = specsOf(opts.type);
  const primary = Object.keys(specs).find((f) => specs[f].primary);
  const state: WriteState = opts.state ?? { sourceLang: 'en', base: {}, authors: {} };
  const val = (f: string, l: Locale): string | null | undefined => {
    const v = opts.input[f]?.[l];
    return v === undefined ? undefined : clean(v);
  };
  const fail = () => new MissingTitleError(opts.missingTitle ?? 'Enter a title in English or French.');

  let source: Locale = state.sourceLang;
  if (opts.create) {
    const en = primary ? val(primary, 'en') : undefined;
    const fr = primary ? val(primary, 'fr') : undefined;
    if (primary && !en && !fr) throw fail(); // C-I1
    if (en && fr) source = isLocale(opts.clientSourceLang) ? opts.clientSourceLang : 'en';
    else source = fr && !en ? 'fr' : 'en';
  }
  const other = otherLocale(source);
  const plan: WritePlan = { sourceLang: source, base: {}, authors: [], deletes: [], flipped: false, touched: false };

  // The title stays in the source language unless it is cleared there while the other language still has one.
  if (!opts.create && primary) {
    const clearedHere = val(primary, source) === null;
    if (clearedHere) {
      const next = val(primary, other) !== undefined ? val(primary, other) : (state.authors[primary]?.[other] ?? null);
      if (!next) throw fail(); // C-I1
      return flip(opts, specs, state, source);
    }
  }
  if (!opts.create && primary) {
    // Clearing the only language it has (the other row is absent) is refused even if the other side is "untouched".
    const hereAfter = val(primary, source) !== undefined ? val(primary, source) : state.base[primary];
    if (!hereAfter) throw fail(); // C-I1
  }

  for (const [field, spec] of Object.entries(specs)) {
    for (const locale of LOCALES) {
      const v = val(field, locale);
      if (v === undefined) continue;
      if (v !== null && v.length > spec.max) throw new Error(`${spec.label} must be at most ${spec.max} characters.`);
      plan.touched = true;
      if (locale === source) {
        plan.base[field] = v;
      } else if (v === null) {
        plan.deletes.push({ field, locale });
      } else {
        plan.authors.push({ field, locale, value: v });
      }
    }
  }
  return plan;
}

/**
 * The title was cleared in the source language: the other language becomes the source. Every field swaps sides:
 * what the other language had (author row or the value sent) moves into the base column, and the old base text
 * becomes an author row in the old language (a person wrote it), so nothing is lost and the machine re-derives the rest.
 */
function flip(
  opts: { input: Record<string, FieldInput> },
  specs: Record<string, FieldSpec>,
  state: WriteState,
  oldSource: Locale,
): WritePlan {
  const next = otherLocale(oldSource);
  const plan: WritePlan = { sourceLang: next, base: {}, authors: [], deletes: [], flipped: true, touched: true };
  for (const [field, spec] of Object.entries(specs)) {
    const sentOld = opts.input[field]?.[oldSource];
    const sentNext = opts.input[field]?.[next];
    const oldText = sentOld !== undefined ? clean(sentOld) : state.base[field] ?? null;
    const newText = sentNext !== undefined ? clean(sentNext) : state.authors[field]?.[next] ?? null;
    if (newText && newText.length > spec.max) throw new Error(`${spec.label} must be at most ${spec.max} characters.`);
    plan.base[field] = newText;
    if (state.authors[field]?.[next] !== undefined || sentNext !== undefined) plan.deletes.push({ field, locale: next });
    if (oldText) plan.authors.push({ field, locale: oldSource, value: oldText });
    else plan.deletes.push({ field, locale: oldSource });
  }
  return plan;
}

// ── Composing ──────────────────────────────────────────────────────────────────────────────

export interface ComposedText {
  en: string | null;
  fr: string | null;
  /** The served value of that language came from a machine row. */
  machine: Record<Locale, boolean>;
  /** A machine still has to produce the missing language (nothing valid is stored yet). */
  missing: boolean;
}

/** Which text a machine row was made from, to check the row is not stale. */
function expectedHash(row: RowLite, base: string | null, sourceLang: string, rows: Partial<Record<Locale, RowLite>>): string | null {
  const from = row.sourceLang ?? sourceLang;
  const text = from === sourceLang ? base : isLocale(from) && rows[from]?.origin === 'author' ? rows[from]!.value : null;
  return text ? sourceHash(from, text) : null;
}

const isCurrent = (row: RowLite | undefined, base: string | null, sourceLang: string, rows: Partial<Record<Locale, RowLite>>): boolean => {
  if (!row) return false;
  if (row.origin !== 'machine') return true; // author / snapshot rows are served as written
  const want = expectedHash(row, base, sourceLang, rows);
  return !!want && row.sourceHash === want;
};

/**
 * One text field in both languages. English = the source when the record was written in English, else the
 * English row, else the source; French the same way. A stale machine row (its source changed since) is not served.
 */
export function composeText(sourceLang: string, baseRaw: string | null | undefined, rowsOfField: RowLite[]): ComposedText {
  const S: Locale = isLocale(sourceLang) ? sourceLang : 'en';
  const base = clean(baseRaw);
  const byLocale: Partial<Record<Locale, RowLite>> = {};
  for (const r of rowsOfField) if (isLocale(r.locale)) byLocale[r.locale] = r;
  const out: ComposedText = { en: null, fr: null, machine: { en: false, fr: false }, missing: false };
  for (const L of LOCALES) {
    const row = byLocale[L];
    const current = isCurrent(row, base, S, byLocale);
    let value: string | null;
    if (L === S) {
      const authorOther = byLocale[otherLocale(S)]?.origin === 'author' ? byLocale[otherLocale(S)]!.value : null;
      if (base) value = base;
      else if (current && row) {
        value = row.value;
        out.machine[L] = row.origin === 'machine';
      } else value = authorOther;
      if (!base && authorOther && !current && shouldTranslate(authorOther)) out.missing = true;
    } else {
      if (current && row) {
        value = row.value;
        out.machine[L] = row.origin === 'machine';
      } else {
        value = base ?? (byLocale[S]?.origin === 'author' ? byLocale[S]!.value : null);
        if (base && shouldTranslate(base)) out.missing = true;
      }
    }
    out[L] = value;
  }
  return out;
}

export interface ComposedVariants {
  en: VariantGroup[];
  fr: VariantGroup[];
  machine: Record<Locale, boolean>;
  missing: boolean;
}

/** Same shape: equal group count and, per group, equal option count (the labels are index-aligned with the canonical options). */
export function sameShape(a: VariantGroup[], b: unknown): b is VariantGroup[] {
  return (
    Array.isArray(b) &&
    a.length === b.length &&
    b.every((g, i) => g && typeof g.name === 'string' && Array.isArray(g.options) && g.options.length === a[i].options.length && g.options.every((o: unknown) => typeof o === 'string'))
  );
}

/** Option labels of a variants field in both languages, index-aligned with the canonical `variants` (C-I4: a row of the wrong shape is ignored). */
export function composeVariants(sourceLang: string, canonicalJson: string | null | undefined, rowsOfField: RowLite[]): ComposedVariants {
  const S: Locale = isLocale(sourceLang) ? sourceLang : 'en';
  const canonical = storedVariantGroups(canonicalJson);
  const json = canonical.length ? JSON.stringify(canonical) : null;
  const out: ComposedVariants = { en: canonical, fr: canonical, machine: { en: false, fr: false }, missing: false };
  if (!canonical.length) return out;
  for (const row of rowsOfField) {
    if (!isLocale(row.locale) || row.locale === S) continue;
    let groups: unknown;
    try {
      groups = JSON.parse(row.value);
    } catch {
      continue;
    }
    if (!sameShape(canonical, groups)) continue; // C-I4
    if (!isCurrent(row, json, S, {})) continue;
    out[row.locale] = groups;
    out.machine[row.locale] = row.origin === 'machine';
  }
  const O = otherLocale(S);
  const hasRow = out[O] !== canonical;
  if (!hasRow && variantStrings(canonical).length) out.missing = true;
  return out;
}

/** The option-group strings a machine has to translate (names and options carrying language). */
export function variantStrings(groups: VariantGroup[]): string[] {
  const set = new Set<string>();
  for (const g of groups) {
    if (shouldTranslate(g.name)) set.add(g.name);
    for (const o of g.options) if (shouldTranslate(o)) set.add(o);
  }
  return [...set];
}

/** Rebuild groups with translated strings (anything not in the map is copied as-is). */
export function applyVariantStrings(groups: VariantGroup[], map: Map<string, string>): VariantGroup[] {
  return groups.map((g) => ({ name: map.get(g.name) ?? g.name, options: g.options.map((o) => map.get(o) ?? o) }));
}

// ── Work (what a machine still has to do for one record) ───────────────────────────────────

export interface WorkItem {
  field: string;
  /** The language to produce. */
  to: Locale;
  /** The language of `text`. */
  from: Locale;
  /** The source text (variants: the canonical JSON). */
  text: string;
  hash: string;
  kind: 'text' | 'variants';
  /** Characters a translator would be billed for. */
  chars: number;
}

/**
 * What still needs a machine for a record: for every translatable field and language, no valid row exists, the
 * text carries language, and no author wrote it. Also returns machine rows to delete (their source is gone).
 */
export function planWork(
  type: TranslationEntityType,
  entity: { sourceLang: string } & Record<string, unknown>,
  rows: RowLite[],
): { items: WorkItem[]; obsolete: { field: string; locale: Locale }[] } {
  const S: Locale = isLocale(entity.sourceLang) ? entity.sourceLang : 'en';
  const items: WorkItem[] = [];
  const obsolete: { field: string; locale: Locale }[] = [];
  for (const [field, spec] of Object.entries(specsOf(type))) {
    const mine = rows.filter((r) => r.field === field);
    const byLocale: Partial<Record<Locale, RowLite>> = {};
    for (const r of mine) if (isLocale(r.locale)) byLocale[r.locale] = r;
    const base = clean(entity[spec.column]);
    for (const to of LOCALES) {
      const row = byLocale[to];
      if (row && row.origin !== 'machine') continue; // author / snapshot: never touched (C-I6)
      let from: Locale | null = null;
      let text: string | null = null;
      if (to !== S) {
        if (base) {
          from = S;
          text = base;
        }
      } else if (!base) {
        const o = byLocale[otherLocale(S)];
        if (o && o.origin === 'author') {
          from = otherLocale(S);
          text = o.value;
        }
      }
      if (!from || !text) {
        if (row) obsolete.push({ field, locale: to });
        continue;
      }
      if (spec.json) {
        const groups = storedVariantGroups(text);
        if (!groups.length || !variantStrings(groups).length) {
          if (row) obsolete.push({ field, locale: to });
          continue;
        }
        text = JSON.stringify(groups);
      } else if (!shouldTranslate(text)) {
        if (row) obsolete.push({ field, locale: to });
        continue;
      }
      const hash = sourceHash(from, text);
      if (row && row.sourceHash === hash && (!spec.json || sameShape(storedVariantGroups(text), safeJson(row.value)))) continue; // current
      const chars = spec.json ? variantStrings(storedVariantGroups(text)).reduce((n, s) => n + s.length, 0) : text.length;
      items.push({ field, to, from, text, hash, kind: spec.json ? 'variants' : 'text', chars });
    }
  }
  return { items, obsolete };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
