/** Accent-free, lower-case words: "Électronique Sans-fil" → ["electronique", "sans", "fil"]. */
export function words(v: string | null | undefined): string[] {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Edit distance capped at 2 (enough for one typo). */
export function near(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export interface Searchable {
  id: string;
  name: string;
  nameFr?: string | null;
  category?: string | null;
  categoryFr?: string | null;
  sellerName?: string | null;
  description?: string | null;
  rating?: number;
  reviewsCount?: number;
}

/**
 * Relevance of one product for the query (0 = no match). Every query word must match somewhere; name matches
 * weigh most, then category / seller, then description. Words of 4+ letters also match with one typo.
 */
export function score(p: Searchable, query: string): number {
  const q = words(query);
  if (q.length === 0) return 0;
  const fields: [string[], number][] = [
    [words(p.name), 10],
    [words(p.nameFr), 8],
    [[...words(p.category), ...words(p.categoryFr)], 5],
    [words(p.sellerName), 4],
    [words(p.description), 1],
  ];
  let total = 0;
  for (const w of q) {
    let best = 0;
    for (const [ws, weight] of fields) {
      for (const x of ws) {
        let s = 0;
        if (x === w) s = 3;
        else if (x.startsWith(w)) s = 2;
        else if (w.length >= 4 && near(x, w)) s = 1;
        if (s * weight > best) best = s * weight;
      }
    }
    if (best === 0) return 0; // every word must match
    total += best;
  }
  const full = words(p.name).join(' ');
  if (full.startsWith(q.join(' '))) total += 15; // the name starts with the whole query
  return total + Math.min(5, (p.rating ?? 0)) * 0.5 + Math.min(3, Math.log10(1 + (p.reviewsCount ?? 0)));
}
