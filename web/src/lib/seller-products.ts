/**
 * Product helpers for the seller portal: gallery limits, SKU / weight handling, stock per option, and the French
 * text of the CSV import report (docs/contracts/commerce.md §4).
 */
import { frenchServerMessage } from "@/lib/seller-errors";
import type { VariantGroup } from "@/lib/variants";
import { variantLabel } from "@/lib/variants";

export const MAX_IMAGES = 8;
export const MAX_SKU = 60;
/** Socket.IO's message limit is 1 MB: the API refuses inline CSV text over 900 KB. */
export const MAX_IMPORT_BYTES = 900_000;
export const MAX_IMPORT_ROWS = 500;

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/# ]*$/;

/** The reason a SKU is not acceptable (null = fine or empty: the SKU is optional). */
export function skuProblem(sku: string, fr: boolean): string | null {
  const v = sku.trim();
  if (!v) return null;
  if (v.length > MAX_SKU || !SKU_RE.test(v)) {
    return fr
      ? "Le SKU peut contenir des lettres, des chiffres et . _ - / # (60 caractères maximum)."
      : "SKU can use letters, numbers and . _ - / # (up to 60 characters).";
  }
  return null;
}

/** Kilograms typed by the seller ("0,25" or "0.25") -> number, NaN when unreadable, null when empty. */
export function parseKg(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Grams from the server as the kilogram text shown in the form (1250 -> "1.25"). */
export function gramsToKgText(g: number | null | undefined): string {
  if (!g || g <= 0) return "";
  return String(Number((g / 1000).toFixed(3)));
}

export function weightLabel(g: number | null | undefined, fr: boolean): string {
  if (!g || g <= 0) return "—";
  const kg = g / 1000;
  const text = g >= 1000 ? `${Number(kg.toFixed(3)).toLocaleString(fr ? "fr-FR" : "en-US")} kg` : `${g} g`;
  return text;
}

/** Every option combination of a product, in the server's canonical label ("Size: 42 · Colour: Black"). */
export function optionCombos(groups: VariantGroup[]): string[] {
  if (groups.length === 0) return [];
  let combos: Record<string, string>[] = [{}];
  for (const g of groups) combos = combos.flatMap((c) => g.options.map((o) => ({ ...c, [g.name]: o })));
  return combos.map((c) => variantLabel(groups, c));
}

/** Sum of the per-option units that are filled in. */
export function sumUnits(entries: Record<string, number> | null | undefined): number {
  return entries ? Object.values(entries).reduce((t, n) => t + n, 0) : 0;
}

/** Row errors of the CSV import report in the portal's language (known texts are mapped, the rest pass through). */
export function importRowError(rawMessage: string, fr: boolean): string {
  if (!fr) return rawMessage;
  const message = rawMessage.trim().replace(/\.+$/, "");
  const known = frenchServerMessage(message);
  if (known !== message) return known;
  const rules: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^Enter a product title in English or French\.?$/i, () => "Saisissez un titre de produit en anglais ou en français."],
    [/^(.+) must be a whole number between (.+) and (.+)\.?$/i, (m) => `${fieldFr(m[1])} doit être un nombre entier entre ${m[2]} et ${m[3]}.`],
    [/^(.+) must be a number between (.+) and (.+)\.?$/i, (m) => `${fieldFr(m[1])} doit être un nombre entre ${m[2]} et ${m[3]}.`],
    [/^(.+) must be a whole number of at least (.+)\.?$/i, (m) => `${fieldFr(m[1])} doit être un nombre entier d'au moins ${m[2]}.`],
    [/^(.+) must be a number of at least (.+)\.?$/i, (m) => `${fieldFr(m[1])} doit être un nombre d'au moins ${m[2]}.`],
    [/^(.+) must be a whole number\.?$/i, (m) => `${fieldFr(m[1])} doit être un nombre entier.`],
    [/^(.+) must be a number\.?$/i, (m) => `${fieldFr(m[1])} doit être un nombre.`],
    [/^(.+) must be (\d+)-(\d+) characters\.?$/i, (m) => `${fieldFr(m[1])} doit faire de ${m[2]} à ${m[3]} caractères.`],
    [/^(.+) must be (\d+) characters\.?$/i, (m) => `${fieldFr(m[1])} doit faire ${m[2]} caractères.`],
    [/^Options look like "Size=S\|M\|L;Colour=Black\|White"\.?$/i, () => "Les options s'écrivent « Taille=S|M|L;Couleur=Noir|Blanc »."],
    [/^Product options are not valid\.?$/i, () => "Les options du produit ne sont pas valides."],
    [/^At most (\d+) option types.*$/i, (m) => `${m[1]} types d'options au maximum (par exemple taille et couleur).`],
    [/^Give each option type a name.*$/i, () => "Donnez un nom à chaque type d'option, par exemple « Taille »."],
    [/^"(.+)" is listed twice\.?$/i, (m) => `« ${m[1]} » est en double.`],
    [/^Add at least one value for "(.+)"\.?$/i, (m) => `Ajoutez au moins une valeur pour « ${m[1]} ».`],
    [/^At most (\d+) values for "(.+)"\.?$/i, (m) => `${m[1]} valeurs au maximum pour « ${m[2]} ».`],
    [/^"(.+)" has the same value twice\.?$/i, (m) => `« ${m[1]} » contient deux fois la même valeur.`],
    [/^Option names and values cannot contain ":" or "·"\.?$/i, () => "Les noms et valeurs d'options ne peuvent pas contenir « : » ni « · »."],
    [/^Your store is awaiting approval.*$/i, () => "Votre boutique attend son approbation : vous pourrez publier des produits une fois approuvée."],
    [/^Your store is not active\. Contact support\.?$/i, () => "Votre boutique n'est pas active. Contactez le support."],
    [/^The file has no products\.?$/i, () => "Le fichier ne contient aucun produit."],
    [/^The file needs a header line and at least one product\.?$/i, () => "Le fichier doit contenir une ligne d'en-tête et au moins un produit."],
    [/^Send the products as .*$/i, () => "Envoyez les produits sous forme de fichier CSV."],
    [/^Category not found.*$/i, () => "Catégorie introuvable : utilisez le nom exact d'une catégorie de la boutique."],
    [/^Unknown category.*$/i, () => "Catégorie inconnue : utilisez le nom exact d'une catégorie de la boutique."],
    [/^Pick a category.*$/i, () => "Choisissez une catégorie."],
  ];
  for (const [re, fn] of rules) {
    const m = re.exec(message);
    if (m) return fn(m);
  }
  return rawMessage;
}

const FIELD_FR: Record<string, string> = {
  Price: "Le prix",
  "Original price": "Le prix barré",
  Stock: "Le stock",
  "Delivery time (days)": "Le délai de livraison (jours)",
  "Weight (g)": "Le poids (g)",
  "Weight (kg)": "Le poids (kg)",
  Brand: "La marque",
  SKU: "Le SKU",
  "Product title": "Le titre du produit",
  "French product title": "Le titre français",
  Description: "La description",
  "French description": "La description française",
};
function fieldFr(label: string): string {
  return FIELD_FR[label] ?? label;
}

/** Save text as a file (the template already starts with a BOM so Excel reads the accents). */
export function saveTextFile(filename: string, text: string, type = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The import report as returned by `products:import`. */
export interface ImportRowReport {
  row: number;
  name: string | null;
  sku: string | null;
  errors: string[];
  productId?: string;
}
export interface ImportReport {
  total: number;
  created: number;
  failed: number;
  dryRun: boolean;
  errors: ImportRowReport[];
  products: ImportRowReport[];
}
