import { DataSource } from 'typeorm';
import { ENTITIES, Hub, User } from '../database/entities';
import { geoWorld } from '../testing/geo-world';
import { GeoGateway } from './geo.gateway';
import { NotServedException, notServedFields } from './geo.service';
import { RiderService } from '../warehouse/rider.service';
import { DeliveryTask, Order } from '../database/entities';

/** The geography and coverage events as the clients call them, with who may call what. */
describe('geo gateway', () => {
  let ds: DataSource;
  let w: Awaited<ReturnType<typeof geoWorld>>;
  let gw: GeoGateway;
  let K: Hub;
  let L: Hub;
  let seq = 0;
  const as = (id: string, role: string) => ({ data: { user: { id, role, name: role } } }) as never;
  const GUEST = { data: { user: { id: 'guest', role: 'guest', name: 'Guest' } } } as never;
  const mkUser = (role: User['role'], hubId: string | null, warehouseTier: User['warehouseTier'] = null) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `g${n}`, email: `g${n}@t.test`, passwordHash: 'x', name: `${role}${n}`, role, hubId, warehouseTier }));
  };
  const id = async (code: string) => (await w.area(code)).id;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    w = await geoWorld(ds);
    gw = new GeoGateway(w.geo, w.coverage, { toRoles: () => undefined, broadcast: () => undefined, toUser: () => undefined, toHub: () => undefined } as never, ds.getRepository(User), ds.getRepository('AuditLog') as never);
    K = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Kinshasa', city: 'Kinshasa', active: true, areaId: await id('CD-KN-GOM') }));
    L = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Limete', city: 'Kinshasa', active: true, areaId: await id('CD-KN-LMT') }));
    await w.coverage.assign({ hubId: K.id, areaIds: [await id('CD-KN')] });
    await w.coverage.assign({ hubId: L.id, areaIds: [await id('CD-KN-D-MAM')], feeOverrideUsd: 3 });
  });
  afterEach(async () => ds.destroy());

  it('anybody, guests included, reads the geography', async () => {
    const provinces = await gw.children(GUEST, {});
    expect(provinces.ok && provinces.data).toHaveLength(26);
    expect((await gw.search(GUEST, { q: 'north-kivu' })).ok).toBe(true);
    expect((await gw.resolve({ text: { city: 'Kinshasa' } })).ok).toBe(true);
    expect((await gw.create(GUEST, { parentId: await id('CD-HK-LUB'), level: 'commune', name: 'Zed' }))).toEqual({ ok: false, error: 'Not allowed.' });
    expect((await gw.update(as('c1', 'customer'), { id: await id('CD-HK-LUB'), name: 'X' })).ok).toBe(false);
    expect((await gw.create(as('a1', 'admin'), { parentId: await id('CD-HK-LUB'), level: 'commune', name: 'Zed' })).ok).toBe(true);
  });

  it('a rider reads their own warehouse coverage (and no other), a manager too, an operator and a customer cannot', async () => {
    const rider = await mkUser('rider', L.id);
    const mine = await gw.hubCoverage(as(rider.id, 'rider'), { hubId: L.id });
    expect(mine.ok).toBe(true);
    if (mine.ok) expect((mine.data.areas as { code: string; feeOverrideUsd: number | null }[]).map((a) => [a.code, a.feeOverrideUsd])).toEqual([['CD-KN-D-MAM', 3]]);
    expect(await gw.hubCoverage(as(rider.id, 'rider'), { hubId: K.id })).toEqual({ ok: false, error: 'Not allowed.' });
    const mgr = await mkUser('warehouse_staff', L.id, 'manager');
    expect((await gw.hubCoverage(as(mgr.id, 'warehouse_staff'), { hubId: L.id })).ok).toBe(true);
    expect((await gw.hubCoverage(as(mgr.id, 'warehouse_staff'), { hubId: K.id })).ok).toBe(false);
    const op = await mkUser('warehouse_staff', L.id, 'operator');
    expect((await gw.hubCoverage(as(op.id, 'warehouse_staff'), { hubId: L.id })).ok).toBe(false);
    expect((await gw.hubCoverage(as('c1', 'customer'), { hubId: L.id })).ok).toBe(false);
    expect((await gw.hubCoverage(GUEST, { hubId: L.id })).ok).toBe(false);
    expect((await gw.hubCoverage(as('a1', 'admin'), { hubId: K.id })).ok).toBe(true);
  });

  it('the rider app gets the coverage with its assignment', async () => {
    const rider = await mkUser('rider', L.id);
    const svc = new RiderService(ds.getRepository(DeliveryTask), ds.getRepository(Order), ds.getRepository(User), ds.getRepository(Hub), undefined, w.coverage);
    const a = await svc.assignment(rider.id);
    expect(a.hub).toMatchObject({ id: L.id, name: 'Entrepôt Limete', areaId: L.areaId });
    expect(a.hub?.coverage.map((c) => c.code)).toEqual(['CD-KN-D-MAM']);
    expect(a.hub?.coverage[0]).toMatchObject({ served: true, hubName: 'Entrepôt Limete' });
    expect((await svc.assignment('nobody')).hub).toBeNull();
  });

  it('marks an area partially served when only something inside it is covered', async () => {
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Lubumbashi', city: 'Lubumbashi', active: true }));
    expect(await w.geo.view(await id('CD-HK'))).toMatchObject({ served: false, partiallyServed: false });
    await w.coverage.assign({ hubId: hub.id, areaIds: [await id('CD-HK-LUB')] });
    expect(await w.geo.view(await id('CD-HK'))).toMatchObject({ served: false, partiallyServed: true }); // the province: a served city inside
    expect(await w.geo.view(await id('CD-HK-LUB'))).toMatchObject({ served: true, partiallyServed: false });
    expect(await w.geo.view(await id('CD-HK-LIK'))).toMatchObject({ served: false, partiallyServed: false }); // Likasi: nothing
    expect(await w.geo.view(await id('CD'))).toMatchObject({ partiallyServed: true });
    // Kinshasa is covered by the province row: served, never "partially"
    expect(await w.geo.view(await id('CD-KN'))).toMatchObject({ served: true, partiallyServed: false });
    // the flag follows coverage changes
    await w.coverage.unassign({ hubId: hub.id, areaIds: [await id('CD-HK-LUB')] });
    expect(await w.geo.view(await id('CD-HK'))).toMatchObject({ partiallyServed: false });
    // and a province whose only covered part is a district
    const koth = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Matadi', city: 'Matadi', active: true }));
    await w.coverage.assign({ hubId: koth.id, areaIds: [await id('CD-BC-MAT')] });
    expect((await gw.children(GUEST, {})).ok && ((await gw.children(GUEST, {})) as { data: { code: string; partiallyServed: boolean }[] }).data.find((a) => a.code === 'CD-BC')?.partiallyServed).toBe(true);
  });

  it('lists a city\'s communes in one call with their district, and the cities with any coverage', async () => {
    const flat = await gw.children(GUEST, { parentCode: 'CD-KN-KIN', flatten: 'commune' });
    expect(flat.ok).toBe(true);
    const data = (flat as { data: { code: string; district: { code: string } | null; hubName: string | null }[] }).data;
    expect(data).toHaveLength(24);
    expect(data.find((c) => c.code === 'CD-KN-LMT')).toMatchObject({ district: { code: 'CD-KN-D-MAM' }, hubName: 'Entrepôt Limete' });
    expect(data.find((c) => c.code === 'CD-KN-GOM')).toMatchObject({ district: { code: 'CD-KN-D-LUK' }, hubName: 'Entrepôt Kinshasa' });
    expect(data.every((c) => c.district)).toBe(true);
    const viaAlias = await gw.communes(GUEST, { cityId: await id('CD-KN-KIN') });
    expect(viaAlias.ok && viaAlias.data).toHaveLength(24);
    expect((await gw.communes(GUEST, {})).ok).toBe(true); // Kinshasa by default
    expect((await gw.children(GUEST, { parentCode: 'CD-KN-KIN', flatten: 'quartier' })).ok).toBe(false);
    expect(((await gw.children(GUEST, { parentCode: 'CD-HK', flatten: 'commune' })) as { data: unknown[] }).data).toEqual([]); // no communes there
    const cities = await gw.servedCities();
    expect(cities.ok && (cities.data as { code: string }[]).map((c) => c.code)).toEqual(['CD-KN-KIN']);
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt Kolwezi', city: 'Kolwezi', active: true }));
    await w.coverage.assign({ hubId: hub.id, areaIds: [await id('CD-LU-KOL')] });
    expect(((await gw.servedCities()) as { data: { code: string }[] }).data.map((c) => c.code)).toEqual(['CD-KN-KIN', 'CD-LU-KOL']); // alphabetical: Kinshasa, Kolwezi
  });

  it('sorts a city\'s communes by district, then served first, then by name, so districts never interleave', async () => {
    // Gombe (Lukunga) is Entrepôt Kinshasa's alone; Mont-Amba is Entrepôt Limete's; the rest is not covered
    await w.coverage.unassign({ hubId: K.id, areaIds: [await id('CD-KN')] });
    await w.coverage.assign({ hubId: K.id, areaIds: [await id('CD-KN-GOM')] });
    const codes = async (res: Promise<unknown>) => ((await res) as { data: { code: string; district: { code: string } }[] }).data;
    for (const rows of [await codes(gw.children(GUEST, { parentCode: 'CD-KN-KIN', flatten: 'commune' })), await codes(gw.communes(GUEST, {}))]) {
      expect(rows).toHaveLength(24);
      const runs = rows.map((c) => c.district.code).filter((d, i, all) => i === 0 || d !== all[i - 1]);
      expect(runs).toEqual(['CD-KN-D-FUN', 'CD-KN-D-LUK', 'CD-KN-D-MAM', 'CD-KN-D-TSH']); // each district is one block
      const inDistrict = (d: string) => rows.filter((c) => c.district.code === d).map((c) => c.code);
      expect(inDistrict('CD-KN-D-LUK')).toEqual(['CD-KN-GOM', 'CD-KN-BRM', 'CD-KN-KNS', 'CD-KN-KTB', 'CD-KN-LNG', 'CD-KN-MNG', 'CD-KN-NGL']); // Gombe (served) first, then by name
      expect(inDistrict('CD-KN-D-MAM')).toEqual(['CD-KN-KSN', 'CD-KN-LMB', 'CD-KN-LMT', 'CD-KN-MTT', 'CD-KN-NGB']); // all served: by name
      expect(inDistrict('CD-KN-D-FUN')).toEqual(['CD-KN-BDL', 'CD-KN-BMB', 'CD-KN-KLM', 'CD-KN-KSV', 'CD-KN-MKL', 'CD-KN-NGN', 'CD-KN-SLM']); // none served: by name
    }
    // a served commune in the last district does not jump to the front either
    await w.coverage.assign({ hubId: L.id, areaIds: [await id('CD-KN-MSN')] });
    const after = await codes(gw.communes(GUEST, { cityCode: 'CD-KN-KIN' }));
    expect(after.slice(0, 7).every((c) => c.district.code === 'CD-KN-D-FUN')).toBe(true);
    expect(after.filter((c) => c.district.code === 'CD-KN-D-TSH').map((c) => c.code)[0]).toBe('CD-KN-MSN');
  });

  it('a refusal for an area nobody serves carries the structured fields, in both languages, with the served cities', async () => {
    const err = await w.routing.route({ city: 'Lubumbashi', sellerIds: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(NotServedException);
    expect(err.message).toBe("We don't deliver to Lubumbashi yet.");
    const f = notServedFields(err);
    expect(f).toMatchObject({ code: 'not_served', areaName: 'Lubumbashi', areaNameEn: 'Lubumbashi' });
    expect(f.areaId).toBe(await id('CD-HK-LUB'));
    expect(f.servedCities).toEqual([{ id: await id('CD-KN-KIN'), name: 'Kinshasa', nameEn: 'Kinshasa' }]);
    // an English-named province differs from the French one
    const nk = await w.routing.route({ areaId: await id('CD-NK'), sellerIds: [] }).catch((e) => e);
    expect(notServedFields(nk)).toMatchObject({ areaName: 'Nord-Kivu', areaNameEn: 'North Kivu' });
    // an address nothing could be made of
    const nowhere = await w.routing.route({ city: 'Atlantis', sellerIds: [] }).catch((e) => e);
    expect(nowhere.message).toBe("We don't deliver to Atlantis yet.");
    expect(notServedFields(nowhere)).toMatchObject({ areaId: null, areaName: 'Atlantis', areaNameEn: 'Atlantis', code: 'not_served' });
    expect(notServedFields(new Error('x'))).toEqual({});
  });
});
