/**
 * Helpers for text that exists in two languages (EN / FR) on the server — see docs/MULTILINGUAL-PLAN.md §2.2.
 *
 * The API serves the English text in `name`, the French in `nameFr` (same for description, title, body, productName,
 * variant...). Either can be missing: an old server never sends the `Fr` field, and a record that was never
 * translated has one empty language. EVERY screen picks through these helpers so the fallback is always the same:
 * show the other language rather than nothing.
 */
import type { VariantGroup, VariantLabels } from "@/lib/variants";

export type Lang = "en" | "fr";

export const langOf = (fr: boolean): Lang => (fr ? "fr" : "en");

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The text for the viewer's language; the other language when that one is empty. */
export function pickText(fr: boolean, en: string | null | undefined, frText: string | null | undefined): string {
  const a = str(en);
  const b = str(frText);
  return fr ? b || a : a || b;
}

/**
 * `localized(product, "name", fr)` reads `name` / `nameFr`; `localized(line, "productName", fr)` reads
 * `productName` / `productNameFr`; `localized(notice, "title", fr)` reads `title` / `titleFr`...
 */
export function localized(obj: object | null | undefined, key: string, fr: boolean): string {
  if (!obj) return "";
  const r = obj as Record<string, unknown>;
  return pickText(fr, str(r[key]), str(r[`${key}Fr`]));
}

/** A notification's title and body in the viewer's language (`titleFr` / `bodyFr` come from the server). */
export function localizedNotice(
  n: { title: string; body: string; titleFr?: string | null; bodyFr?: string | null },
  fr: boolean,
): { title: string; body: string } {
  return { title: localized(n, "title", fr) || n.title, body: localized(n, "body", fr) || n.body };
}

/** The stock decisions the server writes on a return / dispute, in French (an agent's own words stay as typed). */
const RESOLUTION_FR: Record<string, string> = {
  "Refunded to wallet": "Remboursé sur le portefeuille",
  "Partially refunded": "Remboursement partiel",
  "Replacement approved": "Remplacement approuvé",
  Rejected: "Refusé",
  Resolved: "Résolu",
  "Cancelled by the customer": "Annulé par le client",
};

/**
 * A return/dispute decision in the viewer's language. The API sends `resolutionFr` (the French of the stock phrases);
 * an old server does not, so a known English phrase is mapped here, and anything an agent typed is shown as it is.
 */
export function resolutionText(d: { resolution?: string | null; resolutionFr?: string | null } | null | undefined, fr: boolean): string {
  const en = str(d?.resolution);
  if (!fr) return en;
  return str(d?.resolutionFr) || RESOLUTION_FR[en] || en;
}

const SUPPORT_CATEGORIES: Record<string, { en: string; fr: string }> = {
  general: { en: "General", fr: "Général" },
  orders: { en: "Orders", fr: "Commandes" },
  payment: { en: "Payment", fr: "Paiement" },
  delivery: { en: "Delivery", fr: "Livraison" },
  returns: { en: "Returns & refunds", fr: "Retours et remboursements" },
  account: { en: "Account", fr: "Compte" },
  payouts: { en: "Payouts & finance", fr: "Versements et finance" },
  products: { en: "Products & moderation", fr: "Produits et modération" },
};

/** A support ticket's category id ("orders") as a label in the viewer's language. */
export function supportCategoryLabel(id: string | null | undefined, fr: boolean): string {
  const k = str(id);
  const hit = SUPPORT_CATEGORIES[k];
  return hit ? (fr ? hit.fr : hit.en) : k;
}

/** A product known by id (statistics rows carry only its English name), named in the viewer's language. */
export function productNameFor(
  products: { id: string; name: string; nameFr?: string | null }[],
  id: string,
  fallback: string,
  fr: boolean,
): string {
  const p = products.find((x) => x.id === id);
  return p ? pickText(fr, p.name, p.nameFr) || fallback : fallback;
}

/** A category named by its English name (statistics rows carry only that), shown in the viewer's language. */
export function categoryLabel(categories: { name: string; nameFr?: string | null }[], name: string, fr: boolean): string {
  const c = categories.find((x) => x.name === name);
  return c ? pickText(fr, c.name, c.nameFr) : name;
}

/** Labels for the notification `type` the server sends (shown as a small badge next to a notice). */
const NOTICE_TYPES: Record<string, { en: string; fr: string }> = {
  order: { en: "Order", fr: "Commande" },
  delivery: { en: "Delivery", fr: "Livraison" },
  task: { en: "Delivery task", fr: "Tâche de livraison" },
  payment: { en: "Payment", fr: "Paiement" },
  payout: { en: "Payout", fr: "Versement" },
  return: { en: "Return", fr: "Retour" },
  exchange: { en: "Exchange", fr: "Échange" },
  replacement: { en: "Replacement", fr: "Remplacement" },
  dispute: { en: "Dispute", fr: "Litige" },
  support: { en: "Support", fr: "Support" },
  product: { en: "Product", fr: "Produit" },
  moderation: { en: "Moderation", fr: "Modération" },
  seller: { en: "Seller", fr: "Vendeur" },
  campaign: { en: "Campaign", fr: "Campagne" },
  marketing: { en: "Marketing", fr: "Marketing" },
  review: { en: "Review", fr: "Avis" },
  question: { en: "Question", fr: "Question" },
  chat: { en: "Message", fr: "Message" },
  message: { en: "Message", fr: "Message" },
  stock: { en: "Stock", fr: "Stock" },
  flash: { en: "Flash sale", fr: "Vente flash" },
  promo: { en: "Promotion", fr: "Promotion" },
  finance: { en: "Finance", fr: "Finance" },
  security: { en: "Security", fr: "Sécurité" },
  team: { en: "Team", fr: "Équipe" },
  system: { en: "System", fr: "Système" },
};

/** A notification's type in the viewer's language ("order" -> "Commande"). An unknown type is shown readable as-is. */
export function noticeTypeLabel(type: string | null | undefined, fr: boolean): string {
  const k = str(type);
  const hit = NOTICE_TYPES[k];
  return hit ? (fr ? hit.fr : hit.en) : k.replace(/_/g, " ");
}

// ── Accent-folding search (L15) ───────────────────────────────────────────────────────────────────────────────────

/** Lower-case, accents removed, ligatures expanded: "Électronique" -> "electronique", "Cœur" -> "coeur". */
export function foldText(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .toLowerCase()
    .trim();
}

/** Every word of the query appears (accent- and case-insensitive) in at least one of the fields. */
export function matchesSearch(query: string, fields: readonly (string | null | undefined)[]): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.map(foldText).join(" ");
  return words.every((w) => haystack.includes(w));
}

// ── Option labels (variants) ──────────────────────────────────────────────────────────────────────────────────────

export interface LabeledGroup {
  /** Canonical group name: the key the cart, stock and order lines use. */
  name: string;
  /** What the shopper reads. */
  label: string;
  options: { value: string; label: string }[];
}

/** True when the labels of this language have exactly the shape of `groups` (else they cannot be trusted: C-I4). */
function labelsFit(groups: VariantGroup[], labels: VariantGroup[] | undefined): labels is VariantGroup[] {
  return (
    !!labels &&
    labels.length === groups.length &&
    labels.every((g, i) => !!g.name && g.options.length === groups[i].options.length && g.options.every(Boolean))
  );
}

/** The option groups with their display labels in the viewer's language (canonical values kept as the keys). */
export function labeledGroups(groups: VariantGroup[], labels: VariantLabels | null | undefined, fr: boolean): LabeledGroup[] {
  const set = labels ? labels[langOf(fr)] : undefined;
  const use = labelsFit(groups, set) ? set : null;
  return groups.map((g, i) => ({
    name: g.name,
    label: use ? use[i].name : g.name,
    options: g.options.map((o, j) => ({ value: o, label: use ? use[i].options[j] : o })),
  }));
}

/**
 * Turns the canonical label "Size: 42 · Colour: Black" into the viewer's language using the product's option
 * labels. Anything that does not line up is returned unchanged ("Default" included).
 */
export function localizeVariantText(
  canonical: string,
  groups: VariantGroup[],
  labels: VariantLabels | null | undefined,
  fr: boolean,
): string {
  if (!canonical || groups.length === 0) return canonical;
  const set = labels ? labels[langOf(fr)] : undefined;
  if (!labelsFit(groups, set)) return canonical;
  const parts = canonical.split(" · ");
  const out: string[] = [];
  for (const part of parts) {
    const cut = part.indexOf(": ");
    if (cut < 0) return canonical;
    const gName = part.slice(0, cut);
    const value = part.slice(cut + 2);
    const gi = groups.findIndex((g) => g.name === gName);
    if (gi < 0) return canonical;
    const oi = groups[gi].options.indexOf(value);
    if (oi < 0) return canonical;
    out.push(`${set[gi].name}: ${set[gi].options[oi]}`);
  }
  return out.join(" · ");
}

// Plain option text ("Default", "256GB Black") that has no stored translation: translate the well-known tokens.
const VARIANT_TOKENS_FR: Record<string, string> = {
  Default: "Par défaut",
  Black: "Noir",
  White: "Blanc",
  Blue: "Bleu",
  Silver: "Argent",
  Grey: "Gris",
  Gray: "Gris",
  Red: "Rouge",
  Green: "Vert",
};

/** The option label of a line when the server stored no translation: known colour / size tokens only. */
export function localizeVariant(variant: string, fr: boolean): string {
  if (!fr || !variant) return variant;
  return variant
    .split(" ")
    .map((tok) => VARIANT_TOKENS_FR[tok] ?? tok.replace(/GB$/i, " Go").replace(/TB$/i, " To"))
    .join(" ");
}

/**
 * The options of an order line in the viewer's language: the translation the server stored when it differs from the
 * canonical text (the API sends `variantFr: null` for a product with no options), else the known tokens.
 */
export function variantDisplay(variant: string, translated: string | null | undefined, fr: boolean): string {
  const t = str(translated);
  if (t && t !== variant) return t;
  return localizeVariant(variant, fr);
}

// ── Translation status of a product ───────────────────────────────────────────────────────────────────────────────

export type TranslationStatus = "done" | "pending" | "failed" | "off";

export interface TranslationInfo {
  sourceLang?: Lang | null;
  machineTranslated?: string[] | null;
  translationStatus?: TranslationStatus | null;
}

/** The served field name of a language: `name` is English, `nameFr` French. */
export const servedField = (field: "name" | "description", lang: Lang): string => (lang === "fr" ? `${field}Fr` : field);

/** The viewer is reading text the machine produced (Google), not text a person wrote. */
export function isMachineText(p: TranslationInfo, field: "name" | "description", lang: Lang): boolean {
  return !!p.machineTranslated?.includes(servedField(field, lang));
}

export type FieldOrigin = "author" | "machine" | "pending" | "failed" | "empty";

/**
 * Where one language of one field comes from, for the seller's status badge:
 *  author  - written by the seller
 *  machine - translated automatically
 *  pending - waiting for the translator (or being refreshed after the source changed)
 *  failed  - the translator gave up
 *  empty   - nothing to show (and nothing to translate)
 */
export function fieldOrigin(
  p: TranslationInfo,
  field: "name" | "description",
  lang: Lang,
  value: string | null | undefined,
  sourceValue: string | null | undefined,
): FieldOrigin {
  const status = p.translationStatus ?? "done";
  if (str(value)) {
    if (isMachineText(p, field, lang)) return status === "pending" ? "pending" : "machine";
    return "author";
  }
  if (!str(sourceValue)) return "empty";
  if (status === "pending") return "pending";
  if (status === "failed") return "failed";
  return "empty";
}

/** The seller's EN / FR texts of one field, as the product row serves them. */
export function bothLanguages(
  p: { name?: string | null; nameFr?: string | null; description?: string | null; descriptionFr?: string | null },
  field: "name" | "description",
): { en: string; fr: string } {
  const r = p as Record<string, unknown>;
  return { en: str(r[field]), fr: str(r[`${field}Fr`]) };
}

// ── Shared UI copy ────────────────────────────────────────────────────────────────────────────────────────────────

/** "1 day" / "3 days" / "1 jour" / "3 jours". */
export const daysLabel = (n: number, fr: boolean): string => (fr ? `${n} ${n > 1 ? "jours" : "jour"}` : `${n} ${n === 1 ? "day" : "days"}`);

/** The hint under every form that has an optional second language. */
export const autoTranslateHint = (fr: boolean): string =>
  fr ? "Laissez une langue vide et nous la traduisons automatiquement." : "Leave one language empty and we translate it automatically.";

/** C-I1: a product needs a title in at least one language. */
export const titleRequiredMessage = (fr: boolean): string =>
  fr ? "Saisissez un titre en anglais ou en français." : "Enter a product title in English or French.";

/**
 * What a seller's form should show in one language of one field. Until the translation arrives the API serves the
 * source text in BOTH languages (the fallback); that copy is not "written in" the other language, so the form shows
 * the field as empty rather than pretending it is.
 */
export function ownText(
  p: TranslationInfo & { name?: string | null; nameFr?: string | null; description?: string | null; descriptionFr?: string | null },
  field: "name" | "description",
  lang: Lang,
): string {
  const { en, fr } = bothLanguages(p, field);
  const own = lang === "fr" ? fr : en;
  const other = lang === "fr" ? en : fr;
  if (!own) return "";
  const source: Lang = p.sourceLang === "fr" ? "fr" : "en";
  if (lang !== source && own === other && !isMachineText(p, field, lang) && (p.translationStatus ?? "done") !== "done") return "";
  return own;
}

/**
 * The French text an admin form should show for a record: the API serves the English text in the `Fr` field until a
 * translation exists, and that copy is not something anyone wrote in French.
 */
export function frInForm(en: string | null | undefined, frText: string | null | undefined): string {
  const f = str(frText);
  return f && f !== str(en) ? f : "";
}
