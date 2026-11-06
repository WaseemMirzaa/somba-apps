import { DataSource } from 'typeorm';
import { Address, ENTITIES } from '../database/entities';
import { geoWorld } from '../testing/geo-world';
import { AddressesService } from './addresses.service';

/** The address book: one default at a time, a deleted default hands over, missing ids are refused (not answered "ok"). */
describe('addresses: list, create, edit, default, delete', () => {
  let ds: DataSource;
  let svc: AddressesService;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    const w = await geoWorld(ds);
    svc = new AddressesService(ds.getRepository(Address), { toUser: () => undefined } as never, w.geo);
  });
  afterEach(async () => ds.destroy());

  const defaults = async (u: string) => (await svc.list(u)).filter((a) => a.isDefault).map((a) => a.label);

  it('the first address is the default; choosing another default moves it', async () => {
    const home = await svc.create('u1', { label: 'Home', line1: '1 Rue A', city: 'Kinshasa', commune: 'Gombe' });
    const work = await svc.create('u1', { label: 'Work', line1: '2 Rue B', city: 'Kinshasa', commune: 'Limete' });
    expect(await defaults('u1')).toEqual(['Home']);
    await svc.update('u1', work.id, { isDefault: true });
    expect(await defaults('u1')).toEqual(['Work']);
    expect(home.isDefault).toBe(true);
  });

  it('deleting the default makes the oldest remaining address the default', async () => {
    const home = await svc.create('u1', { label: 'Home', line1: '1 Rue A', city: 'Kinshasa', commune: 'Gombe' });
    await svc.create('u1', { label: 'Work', line1: '2 Rue B', city: 'Kinshasa', commune: 'Limete' });
    await svc.create('u1', { label: 'Mum', line1: '3 Rue C', city: 'Kinshasa', commune: 'Masina' });
    expect(await svc.remove('u1', home.id)).toBe(true);
    expect(await defaults('u1')).toEqual(['Work']);
  });

  it('deleting a non-default leaves the default; deleting the last address leaves none', async () => {
    const home = await svc.create('u1', { label: 'Home', line1: '1 Rue A', city: 'Kinshasa' });
    const work = await svc.create('u1', { label: 'Work', line1: '2 Rue B', city: 'Kinshasa' });
    expect(await svc.remove('u1', work.id)).toBe(true);
    expect(await defaults('u1')).toEqual(['Home']);
    expect(await svc.remove('u1', home.id)).toBe(true);
    expect(await svc.list('u1')).toEqual([]);
  });

  it('refuses an id that is missing, empty, or another customer\'s, and changes nothing', async () => {
    const mine = await svc.create('u1', { label: 'Home', line1: '1 Rue A', city: 'Kinshasa' });
    expect(await svc.remove('u1', 'nope')).toBe(false);
    expect(await svc.remove('u1', '')).toBe(false);
    expect(await svc.remove('u2', mine.id)).toBe(false);
    expect(await svc.update('u2', mine.id, { label: 'Stolen' })).toBeNull();
    expect((await svc.list('u1'))[0].label).toBe('Home');
  });

  it('keeps a map pin through an edit and lets it be cleared', async () => {
    const a = await svc.create('u1', { line1: '1 Rue A', city: 'Kinshasa', geo: { lat: -4.31, lng: 15.31 } });
    expect(a.geo).toMatchObject({ lat: -4.31, lng: 15.31 });
    expect((await svc.update('u1', a.id, { label: 'Maison' }))?.geo).not.toBeNull();
    expect((await svc.update('u1', a.id, { geo: null as never }))?.geo).toBeNull();
  });
});
