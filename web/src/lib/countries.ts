/**
 * Country names for addresses, in the viewer's language.
 *
 * The API stores an address's `country` as free text (`addresses.country`, `hubs.country`): a customer's map pick
 * saves an ISO code ("CD"), the customer app saves Google's English name ("Democratic Republic of the Congo"), an
 * admin types "DRC". Every screen reads it through here so the same address always reads the same way, in the
 * language of the UI:
 *
 *   countryName("CD", true)                      -> "République démocratique du Congo"
 *   countryName("Democratic Republic of the Congo", false) -> "Democratic Republic of the Congo"
 *   countryName("DRC", true, true)               -> "RD Congo"   (short form for tight spaces)
 *   countryName(null, true)                      -> ""           (a missing country is never guessed)
 *   countryName("Zimbabwe", true)                -> "Zimbabwe"   (not a country we know: shown as typed)
 */

interface Country {
  en: string;
  fr: string;
  /** Short forms for tight spaces; the full name when absent. */
  enShort?: string;
  frShort?: string;
  /** Other spellings people and map services use, compared accent- and case-insensitively. */
  aliases: string[];
}

const COUNTRIES: Record<string, Country> = {
  CD: {
    en: "Democratic Republic of the Congo",
    fr: "République démocratique du Congo",
    enShort: "DR Congo",
    frShort: "RD Congo",
    aliases: ["drc", "dr congo", "d r congo", "rdc", "rd congo", "democratic republic of congo", "democratic republic of the congo", "republique democratique du congo", "congo kinshasa", "congo dr", "congo rdc"],
  },
  CG: {
    en: "Republic of the Congo",
    fr: "République du Congo",
    enShort: "Congo",
    frShort: "Congo",
    aliases: ["congo", "republic of congo", "republic of the congo", "republique du congo", "congo brazzaville", "congo republic"],
  },
  FR: { en: "France", fr: "France", aliases: ["france", "republique francaise", "french republic"] },
  BE: { en: "Belgium", fr: "Belgique", aliases: ["belgium", "belgique", "belgie"] },
  KE: { en: "Kenya", fr: "Kenya", aliases: ["kenya"] },
  ZA: { en: "South Africa", fr: "Afrique du Sud", aliases: ["south africa", "afrique du sud", "rsa"] },
  AO: { en: "Angola", fr: "Angola", aliases: ["angola"] },
  BI: { en: "Burundi", fr: "Burundi", aliases: ["burundi"] },
  RW: { en: "Rwanda", fr: "Rwanda", aliases: ["rwanda"] },
  UG: { en: "Uganda", fr: "Ouganda", aliases: ["uganda", "ouganda"] },
  TZ: { en: "Tanzania", fr: "Tanzanie", aliases: ["tanzania", "tanzanie"] },
  ZM: { en: "Zambia", fr: "Zambie", aliases: ["zambia", "zambie"] },
  CF: { en: "Central African Republic", fr: "République centrafricaine", aliases: ["central african republic", "republique centrafricaine", "rca"] },
  SS: { en: "South Sudan", fr: "Soudan du Sud", aliases: ["south sudan", "soudan du sud"] },
};

/** Lower case, accents removed, punctuation and hyphens turned into single spaces. */
function fold(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_ALIAS: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [code, c] of Object.entries(COUNTRIES)) {
    m[fold(code)] = code;
    for (const a of [c.en, c.fr, ...c.aliases]) m[fold(a)] = code;
  }
  return m;
})();

/** The ISO code of a country given as a code or any known spelling; null when empty or not a country we know. */
export function countryCode(raw: string | null | undefined): string | null {
  const k = fold(raw);
  return k ? (BY_ALIAS[k] ?? null) : null;
}

/**
 * A country in the viewer's language. A code or any known spelling becomes the proper name; text that is not a country
 * we know is returned as typed; a missing value gives "" (never a default).
 */
export function countryName(raw: string | null | undefined, fr: boolean, short = false): string {
  const typed = String(raw ?? "").trim();
  if (!typed) return "";
  const code = countryCode(typed);
  const c = code ? COUNTRIES[code] : null;
  if (!c) return typed;
  if (short) return (fr ? c.frShort : c.enShort) ?? (fr ? c.fr : c.en);
  return fr ? c.fr : c.en;
}

/**
 * What to store for the country of a Google address component: its ISO code ("CD", Google's short name), else the code
 * of its long name, else the long name as Google wrote it. Language-neutral, so the UI language is applied when shown.
 */
export function countryFromGoogle(longName: string | null | undefined, shortName?: string | null): string | undefined {
  const code = String(shortName ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  const long = String(longName ?? "").trim();
  return countryCode(long) ?? (long || undefined);
}

/** Cities that exist only in the DR Congo, to recognise a country that contradicts the address (see below). */
const CONGOLESE_CITIES = new Set(
  [
    "kinshasa", "lubumbashi", "goma", "bukavu", "kisangani", "mbuji mayi", "kolwezi", "matadi", "likasi", "kananga",
    "tshikapa", "mbandaka", "bunia", "uvira", "butembo", "kalemie", "kikwit", "boma", "isiro", "kindu",
  ].map(fold),
);

/**
 * The country an address really has, as an ISO code (or the typed text when it is not a country we know), or null.
 *
 * It is what is stored, with one repair: until now the web address form had no country field and filled in "France"
 * for every address it saved, including those in Kinshasa. A stored "France" next to a city that only exists in the
 * DR Congo is that old default, not an address in France, so it reads as the DR Congo. A MISSING country is never
 * inferred: it stays missing.
 */
export function addressCountryCode(a: { country?: string | null; city?: string | null }): string | null {
  const stored = String(a.country ?? "").trim();
  if (!stored) return null;
  const code = countryCode(stored);
  if (code === "FR" && CONGOLESE_CITIES.has(fold(a.city))) return "CD";
  return code ?? stored;
}

/** The country line of an address in the viewer's language ("" when the address has none). */
export function addressCountryText(a: { country?: string | null; city?: string | null }, fr: boolean, short = false): string {
  const c = addressCountryCode(a);
  return c ? countryName(c, fr, short) : "";
}

/** `[line1, commune, city, country]` without the empty parts. */
export function addressLine(
  a: { line1?: string | null; commune?: string | null; city?: string | null; country?: string | null },
  fr: boolean,
  short = false,
): string {
  return [a.line1, a.commune, a.city, addressCountryText(a, fr, short)]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
