import { normZone, parseZones, zoneForAddress } from './zone-match';

const zones = parseZones(
  JSON.stringify([
    { id: 'gombe', name: 'Gombe', city: 'Kinshasa', feeUsd: 3, hubId: 'h1' },
    { id: 'kinshasa-limete', name: 'Limete', nameFr: 'Limeté', city: 'Kinshasa', feeUsd: 5, hubId: 'h1' },
    { id: 'kenya', name: 'Kenya', city: 'Lubumbashi', feeUsd: 4, hubId: 'h2' },
  ]),
);

describe('zone matching (same rules as the customer app)', () => {
  it('normalises accents, case and the "Commune de" prefix', () => {
    expect(normZone('Commune de LIMETÉ ')).toBe('limete');
    expect(normZone("Commune d'Ngaliema")).toBe('ngaliema');
  });

  it('prefers a valid saved zone id, else matches the commune within the city', () => {
    expect(zoneForAddress({ zoneId: 'kenya', commune: 'Gombe' }, zones)?.id).toBe('kenya');
    expect(zoneForAddress({ commune: 'Limeté', city: 'Kinshasa' }, zones)?.id).toBe('kinshasa-limete');
    expect(zoneForAddress({ zoneId: 'gone', commune: 'gombe' }, zones)?.id).toBe('gombe');
  });

  it('does not cross cities and returns null when nothing matches', () => {
    expect(zoneForAddress({ commune: 'Kenya', city: 'Kinshasa' }, zones)).toBeNull();
    expect(zoneForAddress({ commune: 'Narnia' }, zones)).toBeNull();
    expect(zoneForAddress({}, zones)).toBeNull();
  });

  it('survives a broken setting', () => {
    expect(parseZones('not json')).toEqual([]);
    expect(parseZones(null)).toEqual([]);
  });
});
