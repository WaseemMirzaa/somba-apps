/**
 * Home-page cards (CMS blocks of type `banner`): the form's shape, what it sends to `cms:upsert`, and the checks that run
 * before it is sent (the server checks again). No imports, so `npm test` can run it directly.
 */

export const LINK_TYPES = ["", "product", "category", "store", "deals", "url"] as const;
export type CardLinkType = (typeof LINK_TYPES)[number];

export const LINK_LABEL: Record<CardLinkType, { en: string; fr: string }> = {
  "": { en: "Not tappable", fr: "Non cliquable" },
  product: { en: "A product", fr: "Un produit" },
  category: { en: "A category", fr: "Une catégorie" },
  store: { en: "A store", fr: "Une boutique" },
  deals: { en: "The deals page", fr: "La page des offres" },
  url: { en: "A web address", fr: "Une adresse web" },
};

export const LINK_TARGET_HINT: Record<string, { en: string; fr: string }> = {
  product: { en: "Product id", fr: "Identifiant du produit" },
  category: { en: "Category id", fr: "Identifiant de la catégorie" },
  store: { en: "Store id", fr: "Identifiant de la boutique" },
  url: { en: "https://…", fr: "https://…" },
};

/** The colour tokens the apps know; each draws the card's gradient when it has no picture. */
export const COLOR_KEYS = ["brand", "deal", "blue", "green", "teal", "amber", "ink"] as const;
export type CardColorKey = (typeof COLOR_KEYS)[number];
export const COLOR_LABEL: Record<CardColorKey, { en: string; fr: string }> = {
  brand: { en: "Brand red", fr: "Rouge de la marque" },
  deal: { en: "Deal red", fr: "Rouge promo" },
  blue: { en: "Blue", fr: "Bleu" },
  green: { en: "Green", fr: "Vert" },
  teal: { en: "Teal", fr: "Turquoise" },
  amber: { en: "Amber", fr: "Ambre" },
  ink: { en: "Dark", fr: "Sombre" },
};
/** CSS for the preview (the same hues the apps use). */
export const COLOR_GRADIENT: Record<CardColorKey, string> = {
  brand: "linear-gradient(135deg,#FF1F3A,#E11428 55%,#8A0A18)",
  deal: "linear-gradient(90deg,#FF4D5E,#E11428 55%,#C00E20)",
  blue: "linear-gradient(135deg,#2563EB,#1A3AA8)",
  green: "linear-gradient(135deg,#059669,#065F46)",
  teal: "linear-gradient(135deg,#0F766E,#115E59)",
  amber: "linear-gradient(135deg,#B45309,#92400E)",
  ink: "linear-gradient(135deg,#334155,#0B1020)",
};
export const gradientFor = (key: string | null | undefined): string => COLOR_GRADIENT[(key as CardColorKey) ?? "brand"] ?? COLOR_GRADIENT.brand;

export type CardDraft = {
  key: string;
  title: string;
  titleFr: string;
  body: string;
  bodyFr: string;
  type: string;
  active: boolean;
  imageUrl: string;
  linkType: CardLinkType;
  linkTarget: string;
  ctaText: string;
  ctaTextFr: string;
  colorKey: CardColorKey | "";
  /** `datetime-local` text in the viewer's time zone ("" = no limit). */
  startsAt: string;
  endsAt: string;
};

export type CardRow = {
  key: string;
  title: string;
  titleFr?: string | null;
  body: string;
  bodyFr?: string | null;
  type: string;
  active: boolean;
  imageUrl?: string | null;
  linkType?: string | null;
  linkTarget?: string | null;
  ctaText?: string | null;
  ctaTextFr?: string | null;
  colorKey?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

const p2 = (n: number) => String(n).padStart(2, "0");

/** An ISO instant as the `datetime-local` input wants it (viewer's time zone). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** The input text back to an ISO instant ("" -> null). */
export function fromLocalInput(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function cardFields(row: CardRow): Pick<CardDraft, "imageUrl" | "linkType" | "linkTarget" | "ctaText" | "ctaTextFr" | "colorKey" | "startsAt" | "endsAt"> {
  const lt = (LINK_TYPES as readonly string[]).includes(row.linkType ?? "") ? ((row.linkType ?? "") as CardLinkType) : "";
  const ck = (COLOR_KEYS as readonly string[]).includes(row.colorKey ?? "") ? (row.colorKey as CardColorKey) : "";
  return {
    imageUrl: row.imageUrl ?? "",
    linkType: lt,
    linkTarget: row.linkTarget ?? "",
    ctaText: row.ctaText ?? "",
    ctaTextFr: row.ctaTextFr ?? "",
    colorKey: ck,
    startsAt: toLocalInput(row.startsAt),
    endsAt: toLocalInput(row.endsAt),
  };
}

/** What the admin sees wrong with the form before it is sent; null when it is fine. */
export function cardError(d: CardDraft, fr: boolean): string | null {
  const t = (en: string, f: string) => (fr ? f : en);
  if (!d.key.trim()) return t("Enter a unique key.", "Saisissez une clé unique.");
  const starts = fromLocalInput(d.startsAt);
  const ends = fromLocalInput(d.endsAt);
  if ((d.startsAt && !starts) || (d.endsAt && !ends)) return t("Enter a valid start and end date.", "Saisissez des dates de début et de fin valides.");
  if (starts && ends && ends <= starts) return t("The end date must be after the start date.", "La date de fin doit être postérieure à la date de début.");
  if (d.linkType && d.linkType !== "deals" && !d.linkTarget.trim()) return t("Choose the product, category or store the card opens.", "Choisissez le produit, la catégorie ou la boutique que la carte ouvre.");
  if (d.linkType === "url" && !/^https:\/\/\S+$/i.test(d.linkTarget.trim())) return t("The web address must start with https://.", "L’adresse web doit commencer par https://.");
  if ((d.ctaText.trim() || d.ctaTextFr.trim()) && !d.linkType) return t("A button needs somewhere to go: choose what the card opens.", "Un bouton doit mener quelque part : choisissez ce que la carte ouvre.");
  if (d.ctaText.trim().length > 40 || d.ctaTextFr.trim().length > 40) return t("The button text must be 1 to 40 characters.", "Le texte du bouton doit contenir de 1 à 40 caractères.");
  return null;
}

/** The card part of the `cms:upsert` body: every field is sent, so clearing one clears it on the server. */
export function cardPayload(d: CardDraft): Record<string, unknown> {
  const link = d.linkType;
  return {
    imageUrl: d.imageUrl.trim() || null,
    linkType: link || null,
    linkTarget: link && link !== "deals" ? d.linkTarget.trim() : null,
    ctaText: d.ctaText.trim() || null,
    ctaTextFr: d.ctaTextFr.trim() || null,
    colorKey: d.colorKey || null,
    startsAt: fromLocalInput(d.startsAt),
    endsAt: fromLocalInput(d.endsAt),
  };
}

/** The keys in order after moving the card at `index` up (-1) or down (+1); the same list when it cannot move. */
export function movedKeys(keys: string[], index: number, by: -1 | 1): string[] {
  const to = index + by;
  if (index < 0 || index >= keys.length || to < 0 || to >= keys.length) return keys;
  const out = [...keys];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** Live now, scheduled for later, ended, or hidden: for the badge on a row. */
export function cardState(row: Pick<CardRow, "active" | "startsAt" | "endsAt">, now = new Date()): "hidden" | "scheduled" | "ended" | "live" {
  if (!row.active) return "hidden";
  if (row.startsAt && new Date(row.startsAt) > now) return "scheduled";
  if (row.endsAt && new Date(row.endsAt) <= now) return "ended";
  return "live";
}
