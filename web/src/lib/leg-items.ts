/**
 * The cargo of a leg as text, in the viewer's language. A line carries the product's name as the order snapshotted it
 * (`name`) and, from the server on, its French name (`nameFr`). A leg created before `nameFr` existed has only `name`:
 * it is shown as it is, in both languages.
 *
 * Type-only imports: `npm test` loads this file on its own.
 */
import type { LegItem } from "@/lib/logistics";

/** One line's name for the reader: the French name when French is asked and present, else the base name. */
export function legItemName(item: Pick<LegItem, "name" | "nameFr">, fr: boolean): string {
  const nameFr = typeof item.nameFr === "string" ? item.nameFr.trim() : "";
  return fr && nameFr ? nameFr : item.name;
}

/** The size / option of a line ("L / Blue") in the viewer's language; "" for a product without options ("Default" is nothing). */
export function legItemVariant(item: Pick<LegItem, "variant" | "variantFr">, fr: boolean): string {
  const variantFr = typeof item.variantFr === "string" ? item.variantFr.trim() : "";
  const variant = (fr && variantFr ? variantFr : (item.variant ?? "")).trim();
  return variant.toLowerCase() === "default" ? "" : variant;
}

/** Lines of a leg's cargo as text ("2 × Sony headphones (Black), 1 × MacBook (13 inch)"): the options too; "—" when it carries nothing. */
export function legItemsText(items: LegItem[] | undefined, fr: boolean): string {
  return (
    (items ?? [])
      .map((i) => {
        const v = legItemVariant(i, fr);
        return `${i.qty} × ${legItemName(i, fr)}${v ? ` (${v})` : ""}`;
      })
      .join(", ") || "—"
  );
}
