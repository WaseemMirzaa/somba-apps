/**
 * The vocabulary of the delivery geography: levels, which level may sit under which, and the name normalisation used
 * everywhere an area is matched by a name (Google components, typed text, search). Pure, no I/O: the migration, the
 * services and the specs all use it.
 */
import type { AreaLevel } from '../database/entities/geo-area.entity';

export type { AreaLevel };

export const AREA_LEVELS: readonly AreaLevel[] = ['country', 'province', 'city', 'district', 'commune', 'quartier'];

/** Depth is fixed by level (a city with communes but no district simply has nothing at depth 3). */
export const LEVEL_DEPTH: Record<AreaLevel, number> = { country: 0, province: 1, city: 2, district: 3, commune: 4, quartier: 5 };

/** Which levels an admin may add under a given level. */
export const CHILD_LEVELS: Record<AreaLevel, readonly AreaLevel[]> = {
  country: ['province'],
  province: ['city'],
  city: ['district', 'commune', 'quartier'],
  district: ['commune'],
  commune: ['quartier'],
  quartier: [],
};

export const isAreaLevel = (v: unknown): v is AreaLevel => typeof v === 'string' && (AREA_LEVELS as readonly string[]).includes(v);

/** Lower-case and strip accents (keeps spaces and punctuation). */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[’‘`´]/g, "'");
}

/**
 * The matching key of a place name: lower-case, no accents, and no hyphens, apostrophes, spaces or other punctuation.
 * "N'djili" and "Ndjili" are the same key, so are "Mont-Ngafula" and "Mont Ngafula", "Équateur" and "Equateur".
 */
export function normArea(s: string | null | undefined): string {
  if (!s) return '';
  return foldText(String(s)).replace(/[^a-z0-9]/g, '');
}

const PREFIX = /^(?:commune|ville|province|territoire|quartier|district|city|town)\s+(?:(?:de\s+la|de\s+l'?|du|des|de|d'|la|le|l')\s*)?/;
const SUFFIX = /\s+(?:province|city|ville|district|commune|territory|region)$/;

/**
 * Every key a name can be found under: its own normalised form, and the form without an administrative word around it
 * ("Commune de la Gombe" -> gombe, "Kinshasa Province" -> kinshasa, "Ville de Kinshasa" -> kinshasa).
 * The first key is the exact one.
 */
export function areaKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const folded = foldText(String(raw)).trim();
  const out: string[] = [];
  const push = (s: string) => {
    const k = s.replace(/[^a-z0-9]/g, '');
    if (k && !out.includes(k)) out.push(k);
  };
  push(folded);
  const noPrefix = folded.replace(PREFIX, '');
  push(noPrefix);
  push(noPrefix.replace(SUFFIX, ''));
  push(folded.replace(SUFFIX, ''));
  return out;
}

/** A URL-safe code fragment from a name: "Mont Ngafula" -> "MNG", "Kimbanseke" -> "KIM". */
export function codeFragment(name: string): string {
  const words = foldText(name)
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/[\s'-]+/)
    .filter(Boolean);
  if (!words.length) return 'XXX';
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase().padEnd(3, 'X');
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
