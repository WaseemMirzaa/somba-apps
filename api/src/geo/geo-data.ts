/**
 * The DRC geography as data: loading `drc.json` (+ the optional `google-names.json`) and turning it into the rows of
 * `geo_areas`. Pure and synchronous, shared by the migration, the dev seed, the production bootstrap and the specs.
 *
 * drc.json: { country, provinces: [{ code, name, nameEn, capital, lat, lng, cities: [{ code, name, nameEn?, lat, lng,
 *   isCapital, districts: [{ code, name, nameEn?, communes: [{ code, name, nameEn?, lat, lng, quartiers: [{ code, name }] }] }],
 *   communes?: [...] }] }], sources }
 * google-names.json: { "<code>": { googleName?, googleNameEn?, nameEn?, aliases? } }
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { AreaLevel } from './area-model';
import { LEVEL_DEPTH } from './area-model';

export interface SeedArea {
  id: string;
  code: string;
  level: AreaLevel;
  name: string;
  nameEn: string | null;
  googleName: string;
  googleNameEn: string;
  aliases: string[];
  parentId: string | null;
  path: string;
  depth: number;
  lat: number | null;
  lng: number | null;
  sortOrder: number;
  meta: Record<string, unknown> | null;
}

export interface GoogleNames {
  [code: string]: { googleName?: string; googleNameEn?: string; nameEn?: string; aliases?: string[] };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

/** Where the data files may live: next to the sources, in the working directory, or beside a compiled build. */
function geoDirs(): string[] {
  return [
    ...(process.env.GEO_DATA_DIR ? [process.env.GEO_DATA_DIR] : []),
    join(__dirname, '..', 'database', 'geo'), join(process.cwd(), 'src', 'database', 'geo'), join(process.cwd(), 'dist', 'database', 'geo'), join(__dirname, '..', '..', 'src', 'database', 'geo')];
}

export function findGeoFile(name: string): string | null {
  for (const d of geoDirs()) {
    const p = join(d, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** drc.json. Throws when it is missing: the platform cannot run without its geography. */
export function loadDrc(): Raw {
  const p = findGeoFile('drc.json');
  if (!p) throw new Error('api/src/database/geo/drc.json is missing (the DRC provinces, cities and communes).');
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** google-names.json when present, else {}. */
export function loadGoogleNames(): GoogleNames {
  const p = findGeoFile('google-names.json');
  if (!p) return {};
  try {
    const v = JSON.parse(readFileSync(p, 'utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Spellings people use for the country itself. */
const COUNTRY_ALIASES = ['RDC', 'DRC', 'RD Congo', 'DR Congo', 'Congo-Kinshasa', 'Congo (Kinshasa)', 'Congo (DRC)', 'Democratic Republic of the Congo', 'République démocratique du Congo'];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Flatten the hierarchy into insertable rows, parents first. Google names default to the official names; the
 * coordinator's `google-names.json` wins where present. Ids are fresh UUIDs unless `existing` (code -> id) has the code.
 */
export function buildAreaRows(drc: Raw, google: GoogleNames = {}, existing: ReadonlyMap<string, string> = new Map()): SeedArea[] {
  const rows: SeedArea[] = [];
  const byCode = new Map<string, SeedArea>();
  const add = (level: AreaLevel, node: Raw, parent: SeedArea | null, sortOrder: number, extraAliases: string[] = []) => {
    const code = txt(node?.code);
    const name = txt(node?.name);
    if (!code || !name || byCode.has(code)) return null;
    const g = google[code] ?? {};
    const nameEn = txt(g.nameEn) ?? txt(node.nameEn) ?? null;
    const googleName = txt(g.googleName) ?? name;
    const googleNameEn = txt(g.googleNameEn) ?? (nameEn ?? googleName);
    const aliases = [...new Set([...(Array.isArray(node.aliases) ? node.aliases : []), ...(g.aliases ?? []), ...extraAliases].filter((a): a is string => typeof a === 'string' && a.trim() !== ''))];
    const meta: Record<string, unknown> = {};
    for (const k of ['status', 'inOwnerList', 'note', 'capital', 'isCapital', 'areaKm2', 'population', 'populationYear'] as const) if (node[k] !== undefined && node[k] !== null && node[k] !== '') meta[k] = node[k];
    const row: SeedArea = {
      id: existing.get(code) ?? randomUUID(),
      code,
      level,
      name,
      nameEn: nameEn && nameEn !== name ? nameEn : null,
      googleName,
      googleNameEn,
      aliases,
      parentId: parent?.id ?? null,
      path: parent ? `${parent.path}/${code}` : code,
      depth: LEVEL_DEPTH[level],
      lat: num(node.lat),
      lng: num(node.lng),
      sortOrder,
      meta: Object.keys(meta).length ? meta : null,
    };
    rows.push(row);
    byCode.set(code, row);
    return row;
  };

  const c = typeof drc?.country === 'string' ? { code: drc.country, name: 'République démocratique du Congo', nameEn: 'Democratic Republic of the Congo' } : (drc?.country ?? {});
  const country = add(
    'country',
    { code: c.code ?? 'CD', name: c.name ?? 'République démocratique du Congo', nameEn: c.nameEn ?? 'Democratic Republic of the Congo', lat: c.lat ?? -2.88, lng: c.lng ?? 23.66 },
    null,
    0,
    COUNTRY_ALIASES,
  );
  if (!country) return rows;

  const communes = (parent: SeedArea, list: Raw[] | undefined) =>
    (list ?? []).forEach((cm, i) => {
      const row = add('commune', cm, parent, i);
      if (row) (cm.quartiers ?? []).forEach((q: Raw, j: number) => add('quartier', q, row, j));
    });

  (drc?.provinces ?? []).forEach((p: Raw, i: number) => {
    const province = add('province', p, country, i);
    if (!province) return;
    (p.cities ?? []).forEach((ct: Raw, j: number) => {
      const city = add('city', ct, province, j);
      if (!city) return;
      (ct.districts ?? []).forEach((d: Raw, k: number) => {
        const district = add('district', d, city, k);
        if (district) communes(district, d.communes);
      });
      communes(city, ct.communes);
      (ct.quartiers ?? []).forEach((q: Raw, k: number) => add('quartier', q, city, k));
    });
  });
  return rows;
}
