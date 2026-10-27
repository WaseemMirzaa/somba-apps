import type { GeoArea } from '../database/entities/geo-area.entity';
import { AreaIndex } from './area-index';
import { areaKeys, codeFragment, normArea } from './area-model';
import { locate, resolveArea, resolveFromComponents, resolveFromFreeText, resolveFromPin, resolveFromText } from './area-resolve';
import { buildAreaRows, loadDrc, loadGoogleNames } from './geo-data';

/** The real DRC geography (drc.json + Google's spellings) in memory. */
const rows = buildAreaRows(loadDrc(), loadGoogleNames());
const ix = new AreaIndex(rows.map((r) => ({ ...r, active: true }) as unknown as GeoArea));
const code = (a: GeoArea | null) => a?.code ?? null;

const comp = (types: string[], long_name: string, short_name = long_name) => ({ types, long_name, short_name });
const COUNTRY_EN = comp(['country', 'political'], 'Democratic Republic of the Congo', 'CD');
const COUNTRY_FR = comp(['country', 'political'], 'République démocratique du Congo', 'CD');

describe('the DRC geography data', () => {
  it('has 26 provinces, 38 cities, Kinshasa 4 districts and 24 communes', () => {
    const count = (level: string) => rows.filter((r) => r.level === level).length;
    expect([count('country'), count('province'), count('city'), count('district'), count('commune')]).toEqual([1, 26, 38, 4, 24]);
    expect(rows.map((r) => r.code).length).toBe(new Set(rows.map((r) => r.code)).size); // codes are unique
    expect(ix.byCode.get('CD-KN')?.name).toBe('Kinshasa');
    expect(ix.byCode.get('CD-KN-GOM')?.path).toBe('CD/CD-KN/CD-KN-KIN/CD-KN-D-LUK/CD-KN-GOM');
    expect(ix.byCode.get('CD-KN-GOM')?.depth).toBe(4);
    expect(ix.byCode.get('CD-HK-LUB')?.depth).toBe(2); // a city
  });

  it("keeps both Google spellings and both names of the provinces that differ by language", () => {
    const nk = ix.byCode.get('CD-NK') as GeoArea;
    expect([nk.name, nk.nameEn, nk.googleName, nk.googleNameEn]).toEqual(['Nord-Kivu', 'North Kivu', 'Nord-Kivu', 'North-Kivu']);
    const eq = ix.byCode.get('CD-EQ') as GeoArea;
    expect([eq.name, eq.nameEn, eq.googleNameEn]).toEqual(['Équateur', 'Equator', 'Equator']);
    const bc = ix.byCode.get('CD-BC') as GeoArea;
    expect([bc.googleName, bc.googleNameEn]).toEqual(['Kongo-Central', 'Kongo Central']);
    // Google's commune spellings are the ones people see
    expect(ix.byCode.get('CD-KN-NDJ')?.googleName).toBe('Ndjili');
    expect(ix.byCode.get('CD-KN-MNG')?.googleName).toBe('Mont Ngafula');
  });
});

describe('name normalisation', () => {
  it('ignores case, accents, hyphens, apostrophes and spaces', () => {
    expect(normArea("N'djili")).toBe('ndjili');
    expect(normArea('Ndjili')).toBe('ndjili');
    expect(normArea('Mont-Ngafula')).toBe(normArea('Mont Ngafula'));
    expect(normArea('Équateur')).toBe(normArea('equateur'));
    expect(normArea('  Kasa-Vubu ')).toBe('kasavubu');
    expect(normArea(null)).toBe('');
  });

  it('strips administrative words around a name', () => {
    expect(areaKeys('Commune de la Gombe')).toContain('gombe');
    expect(areaKeys('Kinshasa Province')).toContain('kinshasa');
    expect(areaKeys("Commune d'Ngaliema")).toContain('ngaliema');
    expect(areaKeys('Ville de Kinshasa')).toContain('kinshasa');
    expect(areaKeys('Gombe')[0]).toBe('gombe');
  });

  it('makes code fragments', () => {
    expect(codeFragment('Mont Ngafula')).toBe('MN');
    expect(codeFragment('Kimbanseke')).toBe('KIMB');
    expect(codeFragment('x')).toBe('XXX');
  });
});

describe('geo:resolve from Google components', () => {
  it('resolves a Kinshasa address to its commune, in French and in English', () => {
    const fr = [comp(['sublocality_level_1', 'sublocality', 'political'], 'Gombe'), comp(['locality', 'political'], 'Kinshasa'), comp(['administrative_area_level_1', 'political'], 'Kinshasa'), COUNTRY_FR];
    const en = [comp(['sublocality_level_1', 'sublocality', 'political'], 'Gombe'), comp(['locality', 'political'], 'Kinshasa'), comp(['administrative_area_level_1', 'political'], 'Kinshasa'), COUNTRY_EN];
    expect(code(resolveFromComponents(ix, fr))).toBe('CD-KN-GOM');
    expect(code(resolveFromComponents(ix, en))).toBe('CD-KN-GOM');
  });

  it("matches Google's spellings: Ndjili (no apostrophe) and Mont Ngafula (no hyphen)", () => {
    const at = (commune: string) => [comp(['sublocality_level_1'], commune), comp(['locality'], 'Kinshasa'), comp(['administrative_area_level_1'], 'Kinshasa'), COUNTRY_EN];
    expect(code(resolveFromComponents(ix, at('Ndjili')))).toBe('CD-KN-NDJ');
    expect(code(resolveFromComponents(ix, at("N'djili")))).toBe('CD-KN-NDJ');
    expect(code(resolveFromComponents(ix, at('Mont Ngafula')))).toBe('CD-KN-MNG');
    expect(code(resolveFromComponents(ix, at('Mont-Ngafula')))).toBe('CD-KN-MNG');
    expect(code(resolveFromComponents(ix, at('Kimbanseke')))).toBe('CD-KN-KMB');
    expect(code(resolveFromComponents(ix, at('Commune de la Gombe')))).toBe('CD-KN-GOM');
  });

  it('resolves the same address from English and French components (provinces that Google spells differently)', () => {
    const goma = (province: string, country = COUNTRY_EN) => [comp(['locality'], 'Goma'), comp(['administrative_area_level_1'], province), country];
    expect(code(resolveFromComponents(ix, goma('Nord-Kivu', COUNTRY_FR)))).toBe('CD-NK-GOM');
    expect(code(resolveFromComponents(ix, goma('North-Kivu')))).toBe('CD-NK-GOM');
    expect(code(resolveFromComponents(ix, goma('North Kivu')))).toBe('CD-NK-GOM');
    const matadi = (province: string) => [comp(['locality'], 'Matadi'), comp(['administrative_area_level_1'], province), COUNTRY_EN];
    expect(code(resolveFromComponents(ix, matadi('Kongo-Central')))).toBe('CD-BC-MAT');
    expect(code(resolveFromComponents(ix, matadi('Kongo Central')))).toBe('CD-BC-MAT');
    // province only (Google gave no locality): the province itself, in either language
    expect(code(resolveFromComponents(ix, [comp(['administrative_area_level_1'], 'Equator'), COUNTRY_EN]))).toBe('CD-EQ');
    expect(code(resolveFromComponents(ix, [comp(['administrative_area_level_1'], 'Équateur'), COUNTRY_FR]))).toBe('CD-EQ');
    expect(code(resolveFromComponents(ix, [comp(['administrative_area_level_1'], 'Haut-Uele'), COUNTRY_EN]))).toBe('CD-HU');
    expect(code(resolveFromComponents(ix, [comp(['administrative_area_level_1'], 'Haut-Uélé'), COUNTRY_FR]))).toBe('CD-HU');
  });

  it('a result in another country is never matched (Brazzaville is not Kinshasa)', () => {
    const brazza = [comp(['sublocality_level_1'], 'Gombe'), comp(['locality'], 'Brazzaville'), comp(['country'], 'Republic of the Congo', 'CG')];
    expect(resolveFromComponents(ix, brazza)).toBeNull();
    expect(resolveArea(ix, { components: brazza, text: { commune: 'Gombe' }, pin: { lat: -4.3, lng: 15.3 } })).toEqual({ area: null, matchedBy: null });
  });

  it('falls back to the city when the commune is unknown, and to nothing for gibberish', () => {
    expect(code(resolveFromComponents(ix, [comp(['sublocality_level_1'], 'Nowhereville'), comp(['locality'], 'Kinshasa'), comp(['administrative_area_level_1'], 'Kinshasa'), COUNTRY_EN]))).toBe('CD-KN-KIN');
    expect(resolveFromComponents(ix, [comp(['locality'], 'Atlantis'), COUNTRY_EN])).toBeNull();
    expect(resolveFromComponents(ix, [])).toBeNull();
  });

  it('matches by the Google component when the same name exists at several levels', () => {
    // "Kinshasa" is a province, a city and a commune
    expect(code(resolveFromComponents(ix, [comp(['administrative_area_level_1'], 'Kinshasa')]))).toBe('CD-KN');
    expect(code(resolveFromComponents(ix, [comp(['locality'], 'Kinshasa')]))).toBe('CD-KN-KIN');
    expect(code(resolveFromComponents(ix, [comp(['sublocality_level_1'], 'Kinshasa'), comp(['locality'], 'Kinshasa'), comp(['administrative_area_level_1'], 'Kinshasa')]))).toBe('CD-KN-KNS');
  });
});

describe('geo:resolve from text, free text and pins', () => {
  it('resolves commune and city text, with aliases and any spelling', () => {
    expect(code(resolveFromText(ix, { commune: 'Limete', city: 'Kinshasa' }))).toBe('CD-KN-LMT');
    expect(code(resolveFromText(ix, { commune: 'kasavubu', city: 'kinshasa' }))).toBe('CD-KN-KSV');
    expect(code(resolveFromText(ix, { commune: "N'Djili" }))).toBe('CD-KN-NDJ');
    expect(code(resolveFromText(ix, { city: 'Lubumbashi' }))).toBe('CD-HK-LUB');
    expect(code(resolveFromText(ix, { city: 'Mbuji Mayi' }))).toBe('CD-KE-MBM');
    expect(code(resolveFromText(ix, { city: 'Kinshasa' }))).toBe('CD-KN-KIN');
    expect(resolveFromText(ix, { city: 'Paris' })).toBeNull();
    expect(resolveFromText(ix, null)).toBeNull();
  });

  it('a commune of another city is ignored when the city is known', () => {
    expect(code(resolveFromText(ix, { city: 'Lubumbashi', commune: 'Gombe' }))).toBe('CD-HK-LUB');
  });

  it('finds the area named inside a free-text address', () => {
    expect(code(resolveFromFreeText(ix, '14 Avenue du Commerce, Gombe, Kinshasa'))).toBe('CD-KN-GOM');
    expect(code(resolveFromFreeText(ix, '8 Boulevard Lumumba, Limete, Kinshasa'))).toBe('CD-KN-LMT');
    expect(code(resolveFromFreeText(ix, '5 avenue Kasa-Vubu, Ndjili, Kinshasa'))).toBe('CD-KN-NDJ');
    expect(code(resolveFromFreeText(ix, 'avenue de la Paix Masina Kinshasa'))).toBe('CD-KN-MSN');
    expect(code(resolveFromFreeText(ix, 'Route Likasi, Lubumbashi'))).toBe('CD-HK-LUB');
    expect(resolveFromFreeText(ix, '5 Rue de Rivoli, Paris')).toBeNull();
    expect(resolveFromFreeText(ix, 'somewhere')).toBeNull();
  });

  it('resolves a pin to the nearest commune centroid, or the nearest city, or nothing', () => {
    expect(code(resolveFromPin(ix, { lat: -4.3543, lng: 15.3467 }))).toBe('CD-KN-LMT');
    expect(code(resolveFromPin(ix, { lat: -4.37, lng: 15.395 }))).toBe('CD-KN-MSN');
    expect(code(resolveFromPin(ix, { lat: -11.66, lng: 27.48 }))).toBe('CD-HK-LUB'); // no communes there: the city
    expect(resolveFromPin(ix, { lat: 48.85, lng: 2.35 })).toBeNull();
    expect(resolveFromPin(ix, { lat: 200, lng: 0 })).toBeNull();
    expect(resolveFromPin(ix, null)).toBeNull();
  });

  it('prefers the deepest consistent source: components over text over pin, and a pin refines a city to a commune', () => {
    expect(resolveArea(ix, { text: { city: 'Kinshasa' }, pin: { lat: -4.3543, lng: 15.3467 } })).toMatchObject({ matchedBy: 'pin' });
    expect(code(resolveArea(ix, { text: { city: 'Kinshasa' }, pin: { lat: -4.3543, lng: 15.3467 } }).area)).toBe('CD-KN-LMT');
    // the typed commune is deeper than the city, so the pin does not override it
    const typed = resolveArea(ix, { text: { commune: 'Gombe', city: 'Kinshasa' }, pin: { lat: -4.3543, lng: 15.3467 } });
    expect([code(typed.area), typed.matchedBy]).toEqual(['CD-KN-GOM', 'text']);
    const both = resolveArea(ix, {
      components: [comp(['sublocality_level_1'], 'Masina'), comp(['locality'], 'Kinshasa'), COUNTRY_EN],
      text: { commune: 'Limete' },
    });
    expect([code(both.area), both.matchedBy]).toEqual(['CD-KN-MSN', 'components']);
    expect(resolveArea(ix, {})).toEqual({ area: null, matchedBy: null });
  });

  it('locate() puts stored data on the map: text first, then the pin inside the matched city', () => {
    expect(code(locate(ix, { text: { commune: 'Limete', city: 'Kinshasa' } }))).toBe('CD-KN-LMT');
    expect(code(locate(ix, { text: { city: 'Kinshasa' }, pin: { lat: -4.4417, lng: 15.4035 } }))).toBe('CD-KN-KMB');
    expect(code(locate(ix, { free: '8 Boulevard Lumumba, Limete, Kinshasa' }))).toBe('CD-KN-LMT');
    expect(code(locate(ix, { pin: { lat: -4.4003, lng: 15.4207 } }))).toBe('CD-KN-KMB');
    expect(locate(ix, { text: { city: 'Paris' } })).toBeNull();
  });
});

describe('the area index', () => {
  it('walks up and down the tree and searches in every name and spelling', () => {
    expect(ix.chain(ix.byCode.get('CD-KN-LMT')?.id).map((a) => a.code)).toEqual(['CD', 'CD-KN', 'CD-KN-KIN', 'CD-KN-D-MAM', 'CD-KN-LMT']);
    expect(ix.ancestorAt(ix.byCode.get('CD-KN-LMT')?.id, 'city')?.code).toBe('CD-KN-KIN');
    expect(ix.children(ix.byCode.get('CD-KN-D-MAM')?.id).map((a) => a.name).sort()).toEqual(['Kisenso', 'Lemba', 'Limete', 'Matete', 'Ngaba']);
    expect(ix.isUnder(ix.byCode.get('CD-KN-LMT')?.id, ix.byCode.get('CD-KN')?.id)).toBe(true);
    expect(ix.isUnder(ix.byCode.get('CD-KN')?.id, ix.byCode.get('CD-KN-LMT')?.id)).toBe(false);
    expect(ix.subtree(ix.byCode.get('CD-KN-KIN')?.id as string)).toHaveLength(1 + 4 + 24);
    const found = (q: string) => ix.search(q).map((a) => a.code);
    expect(found('north kivu')).toContain('CD-NK');
    expect(found('NORD-KIVU')).toContain('CD-NK');
    expect(found('equator')).toContain('CD-EQ');
    expect(found('ndjili')[0]).toBe('CD-KN-NDJ');
    expect(found('lubum')[0]).toBe('CD-HK-LUB');
    expect(found('kinshasa').slice(0, 3)).toEqual(expect.arrayContaining(['CD-KN', 'CD-KN-KIN', 'CD-KN-KNS']));
    expect(found('')).toEqual([]);
  });
});
