/**
 * The condition a customer reports on a replacement request, in the reader's language.
 *
 * The API stores the value as the client sent it and never translates it (`ReplacementsService`: "the customer's own words"). The
 * web request form sends "Defective", "Damaged", "Wrong item" or "Other"; the mobile app sends "defective", "damaged", "wrong_item" or
 * "other". Every page that shows it (customer, seller, warehouse, admin) goes through here, so French readers never see the raw English.
 * A value that is none of these (somebody's own words, an older client) is shown as it was written.
 *
 * No imports: `npm test` loads this file on its own.
 */

type L = { en: string; fr: string };

/** By the normalised value (lower case, words joined with "_"). The English is the short form the pages always showed. */
export const REPLACEMENT_CONDITION: Record<string, L> = {
  defective: { en: "Defective", fr: "Défectueux" },
  damaged: { en: "Damaged", fr: "Endommagé" },
  wrong_item: { en: "Wrong item", fr: "Mauvais article" },
  other: { en: "Other", fr: "Autre" },
};

const normal = (v: string): string => v.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** The label of a reported condition ("—" when there is none). */
export function replacementConditionLabel(value: string | null | undefined, fr: boolean): string {
  if (value == null || value.trim() === "") return "—";
  const known = REPLACEMENT_CONDITION[normal(value)];
  return known ? (fr ? known.fr : known.en) : value.trim();
}
