import { DataSource } from 'typeorm';
import { ENTITIES, GeoArea, Hub, Seller } from '../database/entities';
import { geoWorld } from '../testing/geo-world';

/** Warehouse coverage on the real geography: one owner per area, most specific wins, moves, gaps, who serves what. */
describe('coverage', () => {
  let ds: DataSource;
  let w: Awaited<ReturnType<typeof geoWorld>>;
  const sent: { event: string; payload: any }[] = [];
  const emitter = { toRoles: () => undefined, broadcast: (event: string, payload: unknown) => void sent.push({ event, payload }), toUser: () => undefined, toHub: () => undefined };
  let K: Hub;
  let L: Hub;
  const id = async (code: string) => (await w.area(code)).id;
  const ids = (codes: string[]) => Promise.all(codes.map(id));
  const mkHub = (name: string, areaCode: string, active = true) => w.area(areaCode).then((a) => ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'Kinshasa', lat: -4.3, lng: 15.3, active, areaId: a.id })));

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    sent.length = 0;
    w = await geoWorld(ds, { emitter });
    K = await mkHub('Entrepôt Kinshasa', 'CD-KN-GOM');
    L = await mkHub('Entrepôt Limete', 'CD-KN-LMT');
  });
  afterEach(async () => ds.destroy());

  it('a warehouse covering the province serves every commune; the most specific assignment wins', async () => {
    await w.coverage.assign({ hubId: K.id, areaIds: [await id('CD-KN')] });
    expect((await w.geo.covering(await id('CD-KN-MSN')))?.hubId).toBe(K.id);
    await w.coverage.assign({ hubId: L.id, areaIds: await ids(['CD-KN-D-MAM', 'CD-KN-D-TSH']) });
    expect((await w.geo.covering(await id('CD-KN-LMT')))).toMatchObject({ hubId: L.id, direct: false });
    expect((await w.geo.covering(await id('CD-KN-MSN')))?.hubId).toBe(L.id);
    expect((await w.geo.covering(await id('CD-KN-GOM')))?.hubId).toBe(K.id); // Lukunga still Kinshasa's
    expect((await w.geo.covering(await id('CD-KN-D-MAM')))).toMatchObject({ hubId: L.id, direct: true });
    expect(await w.geo.covering(await id('CD-HK-LUB'))).toBeNull();
    expect(await w.geo.covering(null)).toBeNull();
    // the area payload says who serves it
    expect(await w.geo.view(await id('CD-KN-LMT'))).toMatchObject({ served: true, hubId: L.id, hubName: 'Entrepôt Limete' });
    expect(await w.geo.view(await id('CD-HK-LUB'))).toMatchObject({ served: false, hubId: null, hubName: null });
  });

  it('one owner per area: an owned area is refused (listed as a conflict) unless it is moved', async () => {
    const mat = await id('CD-KN-MTT');
    await w.coverage.assign({ hubId: K.id, areaIds: [mat] });
    const refused = await w.coverage.assign({ hubId: L.id, areaIds: [mat, await id('CD-KN-LMT')] });
    expect(refused.assigned.map((a) => a.code)).toEqual(['CD-KN-LMT']); // the free one goes through
    expect(refused.conflicts).toHaveLength(1);
    expect(refused.conflicts[0]).toMatchObject({ hubId: K.id, hubName: 'Entrepôt Kinshasa', area: { code: 'CD-KN-MTT' } });
    expect((await w.geo.covering(mat))?.hubId).toBe(K.id);
    // the admin confirms the move
    const moved = await w.coverage.assign({ hubId: L.id, areaIds: [mat], move: true });
    expect(moved.conflicts).toEqual([]);
    expect(moved.assigned.map((a) => a.code)).toEqual(['CD-KN-MTT']);
    expect((await w.geo.covering(mat))?.hubId).toBe(L.id);
    expect((await w.coverage.forHub(K.id)).areas).toEqual([]);
    expect((await w.coverage.forHub(L.id)).areas.map((a) => a.code).sort()).toEqual(['CD-KN-LMT', 'CD-KN-MTT']);
    // the push tells everyone which areas changed hands
    const pushed = sent.filter((e) => e.event === 'coverage:updated').pop();
    expect(pushed?.payload).toMatchObject({ hubId: L.id, areaIds: [mat], fromHubIds: [K.id], movedAreaIds: [mat] });
  });

  it('assigning again is harmless, a flat fee can be set and cleared, and unknown areas or hubs are refused', async () => {
    const lmt = await id('CD-KN-LMT');
    await w.coverage.assign({ hubId: L.id, areaIds: [lmt] });
    await w.coverage.assign({ hubId: L.id, areaIds: [lmt], feeOverrideUsd: 3.5 });
    expect((await w.coverage.forHub(L.id)).areas[0].feeOverrideUsd).toBe(3.5);
    expect((await w.geo.covering(lmt))?.feeOverrideUsd).toBe(3.5);
    await w.coverage.assign({ hubId: L.id, areaIds: [lmt], feeOverrideUsd: null });
    expect((await w.geo.covering(lmt))?.feeOverrideUsd).toBeNull();
    await expect(w.coverage.assign({ hubId: L.id, areaIds: ['nope'] })).rejects.toThrow('Area not found.');
    await expect(w.coverage.assign({ hubId: 'nope', areaIds: [lmt] })).rejects.toThrow('Hub not found.');
    await expect(w.coverage.assign({ hubId: L.id, areaIds: [] })).rejects.toThrow('Choose at least one area.');
    await expect(w.coverage.assign({ hubId: L.id, areaIds: [lmt], feeOverrideUsd: -1 })).rejects.toThrow('Flat delivery fee must be');
  });

  it('unassigning frees the area (a wider owner takes over again)', async () => {
    await w.coverage.assign({ hubId: K.id, areaIds: [await id('CD-KN')] });
    await w.coverage.assign({ hubId: L.id, areaIds: [await id('CD-KN-LMT')] });
    expect((await w.geo.covering(await id('CD-KN-LMT')))?.hubId).toBe(L.id);
    expect(await w.coverage.unassign({ hubId: L.id, areaIds: [await id('CD-KN-LMT'), await id('CD-KN-GOM')] })).toEqual({ removed: 1 });
    expect((await w.geo.covering(await id('CD-KN-LMT')))?.hubId).toBe(K.id);
  });

  it('a paused warehouse serves nothing: its areas fall to a wider owner, or become unserved', async () => {
    await w.coverage.assign({ hubId: K.id, areaIds: [await id('CD-KN')] });
    await w.coverage.assign({ hubId: L.id, areaIds: [await id('CD-KN-D-MAM')] });
    await ds.getRepository(Hub).update({ id: L.id }, { active: false });
    await w.coverage.changed([L.id], []);
    expect((await w.geo.covering(await id('CD-KN-LMT')))?.hubId).toBe(K.id);
    await ds.getRepository(Hub).update({ id: K.id }, { active: false });
    await w.coverage.changed([K.id], []);
    expect(await w.geo.covering(await id('CD-KN-GOM'))).toBeNull();
    expect((await w.geo.view(await id('CD-KN-GOM')))?.served).toBe(false);
  });

  it('coverage:map lists who serves a subtree; gaps are the unserved communes of a partly served city', async () => {
    await w.coverage.assign({ hubId: K.id, areaIds: await ids(['CD-KN-D-LUK', 'CD-KN-D-FUN']) });
    await w.coverage.assign({ hubId: L.id, areaIds: await ids(['CD-KN-D-MAM']) });
    const map = await w.coverage.map(await id('CD-KN-KIN'));
    const byCode = new Map((await w.geo.views(map.map((m) => m.areaId))).map((v, i) => [v.code, map[i]]));
    expect(byCode.get('CD-KN-GOM')).toMatchObject({ hubId: K.id, direct: false });
    expect(byCode.get('CD-KN-D-MAM')).toMatchObject({ hubId: L.id, direct: true });
    expect(byCode.has('CD-KN-MSN')).toBe(false); // Tshangu: nobody
    // Tshangu's five communes are the gap
    const gaps = await w.coverage.gaps(await id('CD-KN'));
    expect(gaps.map((g) => g.code).sort()).toEqual(['CD-KN-KMB', 'CD-KN-MLK', 'CD-KN-MSN', 'CD-KN-NDJ', 'CD-KN-NSL']);
    // a wholly unserved province is "coming soon", not a gap
    expect((await w.coverage.gaps(await id('CD-HK'))).map((g) => g.code)).toEqual([]);
    // closing the gap
    await w.coverage.assign({ hubId: L.id, areaIds: [await id('CD-KN-D-TSH')] });
    expect(await w.coverage.gaps(await id('CD-KN'))).toEqual([]);
  });

  it("recomputes every store's origin warehouse whenever coverage changes", async () => {
    const lmt = await id('CD-KN-LMT');
    const seller = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'S', status: 'approved', pickupAreaId: lmt, originHubId: null }));
    await w.coverage.assign({ hubId: K.id, areaIds: [await id('CD-KN')] });
    expect((await ds.getRepository(Seller).findOne({ where: { id: seller.id } }))?.originHubId).toBe(K.id);
    await w.coverage.assign({ hubId: L.id, areaIds: [lmt] });
    expect((await ds.getRepository(Seller).findOne({ where: { id: seller.id } }))?.originHubId).toBe(L.id);
    await w.coverage.unassign({ hubId: L.id, areaIds: [lmt] });
    await w.coverage.unassign({ hubId: K.id, areaIds: [await id('CD-KN')] });
    expect((await ds.getRepository(Seller).findOne({ where: { id: seller.id } }))?.originHubId).toBeNull();
  });
});

describe('the geography service', () => {
  let ds: DataSource;
  let w: Awaited<ReturnType<typeof geoWorld>>;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    w = await geoWorld(ds);
  });
  afterEach(async () => ds.destroy());

  it('lists children (provinces by default), served first, and hides inactive areas from non-admins', async () => {
    const provinces = await w.geo.children({});
    expect(provinces).toHaveLength(26);
    const kn = await w.area('CD-KN');
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'K', city: 'Kinshasa', active: true }));
    await w.coverage.assign({ hubId: hub.id, areaIds: [kn.id] });
    expect((await w.geo.children({}))[0]).toMatchObject({ code: 'CD-KN', served: true }); // served first
    expect((await w.geo.children({ parentCode: 'CD-KN-D-MAM' })).map((a) => a.name).sort()).toEqual(['Kisenso', 'Lemba', 'Limete', 'Matete', 'Ngaba']);
    await w.geo.update({ id: (await w.area('CD-KN-LMT')).id, active: false });
    expect((await w.geo.children({ parentCode: 'CD-KN-D-MAM' })).map((a) => a.name)).not.toContain('Limete');
    expect((await w.geo.children({ parentCode: 'CD-KN-D-MAM' }, { includeInactive: true })).map((a) => a.name)).toContain('Limete');
    await expect(w.geo.children({ parentId: 'nope' })).rejects.toThrow('Area not found.');
  });

  it('builds a nested tree to a depth', async () => {
    const tree = await w.geo.tree({ rootCode: 'CD-KN', depth: 2 });
    expect(tree?.code).toBe('CD-KN');
    expect(tree?.children.map((c) => c.code)).toEqual(['CD-KN-KIN']);
    const city = tree?.children[0] as unknown as { children: { code: string; children: unknown[] }[] };
    expect(city.children.map((d) => d.code).sort()).toEqual(['CD-KN-D-FUN', 'CD-KN-D-LUK', 'CD-KN-D-MAM', 'CD-KN-D-TSH']);
    expect(city.children[0].children).toEqual([]); // depth 2 stops here
    expect((await w.geo.tree({ rootCode: 'CD', depth: 0 }))?.children).toEqual([]);
  });

  it('searches in French, English and Google spellings, with a level filter and served-only', async () => {
    const codes = async (q: string, extra = {}) => (await w.geo.search({ q, ...extra })).map((a) => a.code);
    expect(await codes('north-kivu')).toContain('CD-NK');
    expect(await codes('nord kivu')).toContain('CD-NK');
    expect(await codes('Equator')).toContain('CD-EQ');
    expect((await codes('kinshasa', { level: 'commune' }))).toEqual(['CD-KN-KNS']);
    expect(await codes('mont ngafula')).toContain('CD-KN-MNG');
    expect(await codes('kinshasa', { servedOnly: true })).toEqual([]);
    expect(await codes('lim', { limit: 1 })).toHaveLength(1);
    await expect(w.geo.search({ q: 'x', level: 'planet' })).rejects.toThrow('Level must be one of');
    expect(await codes('')).toEqual([]);
  });

  it('resolve returns the chain, whether it is served, and by whom', async () => {
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'K', city: 'Kinshasa', active: true }));
    await w.coverage.assign({ hubId: hub.id, areaIds: [(await w.area('CD-KN')).id] });
    const r = await w.geo.resolve({ components: [{ types: ['sublocality_level_1'], long_name: 'Ndjili' }, { types: ['locality'], long_name: 'Kinshasa' }, { types: ['administrative_area_level_1'], long_name: 'Kinshasa' }] });
    expect(r).toMatchObject({ served: true, hubId: hub.id, hubName: 'K', matchedBy: 'components', area: { code: 'CD-KN-NDJ' } });
    expect(r.chain.map((a) => a.code)).toEqual(['CD', 'CD-KN', 'CD-KN-KIN', 'CD-KN-D-TSH', 'CD-KN-NDJ']);
    expect(await w.geo.resolve({ text: { city: 'Lubumbashi' } })).toMatchObject({ served: false, hubId: null, matchedBy: 'text', area: { code: 'CD-HK-LUB' } });
    expect(await w.geo.resolve({})).toMatchObject({ area: null, chain: [], served: false, matchedBy: null });
  });

  it('admins add communes and quartiers under any city (codes, depth and path follow), and refuse the impossible', async () => {
    const lub = await w.area('CD-HK-LUB');
    const kenya = await w.geo.create({ parentId: lub.id, level: 'commune', name: 'Kenya', nameEn: 'Kenya', aliases: ['Kenya Lubumbashi'], lat: -11.69, lng: 27.5 });
    expect(kenya).toMatchObject({ level: 'commune', depth: 4, parentId: lub.id, googleName: 'Kenya', googleNameEn: 'Kenya', served: false, active: true });
    expect(kenya.code).toMatch(/^CD-HK-LUB-/);
    expect(kenya.path).toBe(`${lub.path}/${kenya.code}`);
    const quartier = await w.geo.create({ parentId: kenya.id, level: 'quartier', name: 'Bel-Air' });
    expect(quartier).toMatchObject({ level: 'quartier', depth: 5 });
    // it is found by name straight away and resolves
    expect((await w.geo.resolve({ text: { commune: 'kenya', city: 'Lubumbashi' } })).area?.code).toBe(kenya.code);
    await expect(w.geo.create({ parentId: lub.id, level: 'province', name: 'Nope' })).rejects.toThrow('A province cannot be added under a city.');
    await expect(w.geo.create({ parentId: lub.id, level: 'commune', name: 'kenya' })).rejects.toThrow('An area with this name already exists here.');
    await expect(w.geo.create({ parentId: 'nope', level: 'commune', name: 'Zed' })).rejects.toThrow('Area not found.');
    await expect(w.geo.create({ parentId: lub.id, level: 'commune', name: 'Zed', code: 'CD-HK-LUB' })).rejects.toThrow('An area with this code already exists.');
    // edit both names and the Google spellings
    const edited = await w.geo.update({ id: kenya.id, name: 'Kenya (Lubumbashi)', nameEn: 'Kenya EN', googleNameEn: 'Kenya Commune', sortOrder: 3 });
    expect(edited).toMatchObject({ name: 'Kenya (Lubumbashi)', nameEn: 'Kenya EN', googleNameEn: 'Kenya Commune' });
    expect((await w.geo.resolve({ components: [{ types: ['locality'], long_name: 'Lubumbashi' }, { types: ['sublocality'], long_name: 'Kenya Commune' }] })).area?.code).toBe(kenya.code);
    await expect(w.geo.update({ id: kenya.id, active: 'yes' })).rejects.toThrow('Active must be true or false.');
    expect(await ds.getRepository(GeoArea).count()).toBeGreaterThan(93);
  });

  it('seeding twice adds nothing, and keeps admin edits', async () => {
    await w.geo.update({ id: (await w.area('CD-KN-GOM')).id, name: 'La Gombe' });
    expect(await w.geo.ensureSeeded()).toBe(0);
    expect((await w.area('CD-KN-GOM')).name).toBe('La Gombe');
  });
});
