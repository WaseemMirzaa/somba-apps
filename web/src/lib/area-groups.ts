/**
 * Grouping of a city's communes by district (docs/contracts/areas.md, `geo:communes`).
 *
 * `geo:communes { cityId }` returns every commune of a city in one call, each with its own `district` (Kinshasa's
 * Funa / Lukunga / Mont-Amba / Tshangu; null when the city has none). The pickers show them as option groups.
 *
 * No imports: `npm test` loads this file on its own.
 */

interface DistrictLike {
  id: string;
  name: string;
  nameEn?: string | null;
}

export interface CommuneLike {
  id: string;
  level?: string;
  parentId?: string | null;
  /** The commune's district, null when it sits directly under the city. */
  district?: DistrictLike | null;
}

export interface CommuneGroup<D extends DistrictLike, C extends CommuneLike> {
  district: D | null;
  areas: C[];
}

/**
 * Groups communes by their `district` field. Districts come first, by name in the reader's language (the server
 * orders served areas first, so the rows of one district can be spread out); communes that sit directly under the
 * city come last. The order of the communes inside a group is the order the server sent.
 * `districtById` fills in a district when only `parentId` is known (the old per-district calls).
 */
export function groupCommunes<D extends DistrictLike, C extends CommuneLike>(
  rows: C[],
  fr: boolean,
  districtById?: Map<string, D>,
): CommuneGroup<D, C>[] {
  const groups = new Map<string, CommuneGroup<D, C>>();
  for (const row of rows) {
    if (row.level && row.level !== "commune") continue;
    const district = (row.district as D | null | undefined) ?? (row.parentId ? (districtById?.get(row.parentId) ?? null) : null);
    const key = district?.id ?? "";
    let g = groups.get(key);
    if (!g) {
      g = { district, areas: [] };
      groups.set(key, g);
    }
    g.areas.push(row);
  }
  const label = (d: D | null) => (d ? (fr ? d.name : d.nameEn || d.name) : "");
  return [...groups.values()].sort((a, b) => {
    if (!a.district !== !b.district) return a.district ? -1 : 1;
    return label(a.district).localeCompare(label(b.district), fr ? "fr" : "en");
  });
}
