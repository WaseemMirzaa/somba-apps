import { DataSource } from 'typeorm';
import { Address, ENTITIES, Hub } from '../database/entities';
import { geoWorld } from '../testing/geo-world';
import { AddressesService } from './addresses.service';

/** Addresses get their delivery area on the server: from the pin, the Google components or the typed text. */
describe('addresses and areas', () => {
  let ds: DataSource;
  let w: Awaited<ReturnType<typeof geoWorld>>;
  let svc: AddressesService;
  const pushed: unknown[] = [];

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    w = await geoWorld(ds);
    svc = new AddressesService(ds.getRepository(Address), { toUser: (_u: string, _e: string, p: unknown) => void pushed.push(p) } as never, w.geo);
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'K', city: 'Kinshasa', active: true }));
    await w.coverage.assign({ hubId: hub.id, areaIds: [(await w.area('CD-KN')).id] });
  });
  afterEach(async () => ds.destroy());

  it('takes the area the client confirmed and rewrites the text with the areas\' Google names', async () => {
    const lmt = await w.area('CD-KN-LMT');
    const a = await svc.create('u1', { line1: '8 Bd Lumumba', city: 'Kin', commune: 'limete ', areaId: lmt.id } as never);
    expect(a).toMatchObject({ areaId: lmt.id, commune: 'Limete', city: 'Kinshasa', region: 'Kinshasa', country: 'République démocratique du Congo', served: true });
    expect(a.areaChain.map((x) => x.code)).toEqual(['CD', 'CD-KN', 'CD-KN-KIN', 'CD-KN-D-MAM', 'CD-KN-LMT']);
    expect(a.areaChain[4]).toMatchObject({ served: true, hubName: 'K' });
  });

  it('resolves the area itself when the client sends none: pin, then commune and city text, then Google components', async () => {
    expect((await svc.create('u1', { line1: '1', city: 'Kinshasa', commune: "N'Djili" })).commune).toBe('Ndjili');
    const byPin = await svc.create('u1', { line1: '2', city: 'Kinshasa', geo: { lat: -4.3662, lng: 15.391 } });
    expect(byPin.areaChain[byPin.areaChain.length - 1].code).toBe('CD-KN-MSN');
    expect(byPin.commune).toBe('Masina');
    const byComponents = await svc.create('u1', {
      line1: '3',
      city: 'x',
      components: [{ types: ['sublocality_level_1'], long_name: 'Mont Ngafula' }, { types: ['locality'], long_name: 'Kinshasa' }, { types: ['administrative_area_level_1'], long_name: 'Kinshasa' }],
    } as never);
    expect(byComponents).toMatchObject({ commune: 'Mont Ngafula', city: 'Kinshasa' });
    const noCity = await svc.create('u1', { line1: '4', commune: 'Gombe' } as never); // the area supplies the city
    expect(noCity.city).toBe('Kinshasa');
  });

  it('an address outside every served area is kept, flagged not served; one nobody can place has no area', async () => {
    const lub = await svc.create('u1', { line1: '9', city: 'Lubumbashi' });
    expect(lub).toMatchObject({ city: 'Lubumbashi', region: 'Haut-Katanga', served: false });
    expect(lub.areaChain[lub.areaChain.length - 1].code).toBe('CD-HK-LUB');
    const paris = await svc.create('u1', { line1: '8 Rue de Rivoli', city: 'Paris', country: 'France' });
    expect(paris).toMatchObject({ areaId: null, areaChain: [], served: false, city: 'Paris', country: 'France' });
  });

  it('refuses an area that does not exist', async () => {
    await expect(svc.create('u1', { line1: '1', city: 'Kinshasa', areaId: 'nope' } as never)).rejects.toThrow('Area not found.');
    await expect(svc.create('u1', { city: 'Kinshasa' })).rejects.toThrow('Street address and city are required.');
  });

  it('moving the pin or the text re-resolves the area; other edits leave it alone; every list carries the chain', async () => {
    const a = await svc.create('u1', { line1: '1', city: 'Kinshasa', commune: 'Gombe' });
    const kept = await svc.update('u1', a.id, { line1: '1 bis' });
    expect(kept?.areaId).toBe(a.areaId);
    const moved = await svc.update('u1', a.id, { commune: 'Masina', city: 'Kinshasa' });
    expect(moved).toMatchObject({ commune: 'Masina' });
    expect(moved?.areaChain[moved.areaChain.length - 1].code).toBe('CD-KN-MSN');
    const explicit = await svc.update('u1', a.id, { areaId: (await w.area('CD-KN-KMB')).id } as never);
    expect(explicit).toMatchObject({ commune: 'Kimbanseke' });
    const list = await svc.list('u1');
    expect(list[0].areaChain).toHaveLength(5);
    expect(pushed.length).toBeGreaterThan(0);
    expect(await svc.update('u1', 'missing', { line1: 'x' })).toBeNull();
    expect(await svc.list('u2')).toEqual([]);
  });
});
