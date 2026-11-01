import type { GeoArea } from '../database/entities/geo-area.entity';
import { AreaLevel, areaKeys } from './area-model';

/** Every name an area can be found under (both languages, both Google spellings, aliases). */
export function namesOf(a: Pick<GeoArea, 'name' | 'nameEn' | 'googleName' | 'googleNameEn' | 'aliases'>): string[] {
  return [a.name, a.nameEn, a.googleName, a.googleNameEn, ...(a.aliases ?? [])].filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

export interface LookupOptions {
  levels?: readonly AreaLevel[];
  /** Only areas below this one. */
  under?: string | null;
}

/**
 * The whole area tree in memory: by id and code, children, a parent chain, and a normalised-name index.
 * Built from the table rows; a few hundred rows at launch, so a rebuild is cheap. Pure, no I/O.
 */
export class AreaIndex {
  readonly byId = new Map<string, GeoArea>();
  readonly byCode = new Map<string, GeoArea>();
  private readonly kids = new Map<string, GeoArea[]>();
  /** normalised exact key -> areas that carry it; stripped variants live in `loose`. */
  private readonly exact = new Map<string, GeoArea[]>();
  private readonly loose = new Map<string, GeoArea[]>();
  readonly root: GeoArea | null;

  constructor(rows: readonly GeoArea[]) {
    for (const r of rows) {
      this.byId.set(r.id, r);
      this.byCode.set(r.code, r);
    }
    for (const r of rows) {
      if (r.parentId) {
        const list = this.kids.get(r.parentId) ?? [];
        list.push(r);
        this.kids.set(r.parentId, list);
      }
    }
    const byOrder = (a: GeoArea, b: GeoArea) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'fr');
    for (const list of this.kids.values()) list.sort(byOrder);
    this.root = rows.find((r) => r.level === 'country' && !r.parentId) ?? null;
    for (const r of rows) {
      for (const n of namesOf(r)) {
        const [first, ...rest] = areaKeys(n);
        if (first) this.add(this.exact, first, r);
        for (const k of rest) this.add(this.loose, k, r);
      }
    }
  }

  private add(map: Map<string, GeoArea[]>, key: string, area: GeoArea) {
    const list = map.get(key);
    if (!list) map.set(key, [area]);
    else if (!list.includes(area)) list.push(area);
  }

  get size(): number {
    return this.byId.size;
  }

  get(id: string | null | undefined): GeoArea | null {
    return id ? (this.byId.get(id) ?? null) : null;
  }

  children(id: string | null | undefined): GeoArea[] {
    return id ? (this.kids.get(id) ?? []) : [];
  }

  /** Root (country) down to the area itself. Empty for an unknown id. */
  chain(id: string | null | undefined): GeoArea[] {
    const out: GeoArea[] = [];
    let cur = this.get(id);
    for (let guard = 0; cur && guard < 12; guard++) {
      out.unshift(cur);
      cur = this.get(cur.parentId);
    }
    return out;
  }

  /** The nearest ancestor-or-self at a level. */
  ancestorAt(id: string | null | undefined, level: AreaLevel): GeoArea | null {
    const chain = this.chain(id);
    for (let i = chain.length - 1; i >= 0; i--) if (chain[i].level === level) return chain[i];
    return null;
  }

  /** Is `id` equal to, or below, `ancestorId`? */
  isUnder(id: string | null | undefined, ancestorId: string | null | undefined): boolean {
    if (!id || !ancestorId) return false;
    return this.chain(id).some((a) => a.id === ancestorId);
  }

  /** The area and everything below it (depth first, in display order). */
  subtree(id: string): GeoArea[] {
    const root = this.get(id);
    if (!root) return [];
    const out: GeoArea[] = [];
    const walk = (a: GeoArea) => {
      out.push(a);
      for (const c of this.children(a.id)) walk(c);
    };
    walk(root);
    return out;
  }

  /** Areas found under a name. Exact spellings come before looser ones ("Commune de la Gombe" finds Gombe). */
  lookup(raw: string | null | undefined, opts: LookupOptions = {}): GeoArea[] {
    const keys = areaKeys(raw);
    if (!keys.length) return [];
    const seen = new Set<string>();
    const out: GeoArea[] = [];
    const take = (list: GeoArea[] | undefined) => {
      for (const a of list ?? []) {
        if (seen.has(a.id)) continue;
        if (opts.levels && !opts.levels.includes(a.level)) continue;
        if (opts.under && !(a.id !== opts.under && this.isUnder(a.id, opts.under))) continue;
        seen.add(a.id);
        out.push(a);
      }
    };
    // Exact spellings first (the full key), then the stripped variants of the query, then looser stored keys.
    take(this.exact.get(keys[0]));
    for (const k of keys.slice(1)) take(this.exact.get(k));
    take(this.loose.get(keys[0]));
    for (const k of keys.slice(1)) take(this.loose.get(k));
    return out;
  }

  /** Substring search over every name, best matches first (exact, then prefix, then contains). */
  search(q: string, opts: { levels?: readonly AreaLevel[] } = {}): GeoArea[] {
    const key = areaKeys(q)[0];
    if (!key) return [];
    const scored: { a: GeoArea; score: number }[] = [];
    for (const a of this.byId.values()) {
      if (a.level === 'country') continue;
      if (opts.levels && !opts.levels.includes(a.level)) continue;
      let best = 0;
      for (const n of namesOf(a)) {
        for (const k of areaKeys(n)) {
          if (k === key) best = Math.max(best, 3);
          else if (k.startsWith(key)) best = Math.max(best, 2);
          else if (k.includes(key)) best = Math.max(best, 1);
        }
      }
      if (best) scored.push({ a, score: best });
    }
    return scored.sort((x, y) => y.score - x.score || x.a.depth - y.a.depth || x.a.name.localeCompare(y.a.name, 'fr')).map((s) => s.a);
  }
}
