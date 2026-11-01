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

/** Lines of a leg's cargo as text ("2 × Sony headphones, 1 × MacBook"); "—" when it carries nothing. */
export function legItemsText(items: LegItem[] | undefined, fr: boolean): string {
  return (items ?? []).map((i) => `${i.qty} × ${legItemName(i, fr)}`).join(", ") || "—";
}
