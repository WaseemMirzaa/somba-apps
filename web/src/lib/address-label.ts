/**
 * The name of a saved address as the shopper reads it. A label is what the person typed (or the default the site
 * proposed when it was saved: "Home" / "Domicile"), so it is shown as written, except for those default names, which
 * follow the language: an address saved as "Home" reads "Domicile" on the French site and the other way round.
 */
const DEFAULT_LABELS: ReadonlyArray<readonly [en: string, fr: string]> = [
  ["Home", "Domicile"],
  ["Office", "Bureau"],
  ["Work", "Travail"],
  ["New", "Nouvelle"],
];

export function addressLabelText(label: string | null | undefined, fr: boolean): string {
  const text = (label ?? "").trim();
  const key = text.toLowerCase();
  for (const [en, frText] of DEFAULT_LABELS) {
    if (key === en.toLowerCase() || key === frText.toLowerCase()) return fr ? frText : en;
  }
  return text;
}
