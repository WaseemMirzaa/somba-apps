import { DataSource } from 'typeorm';
import { ENTITIES, Hub, Seller, User } from '../database/entities';
import { HubsService } from './hubs.service';
import { geoWorld } from '../testing/geo-world';

/** The hub directory: map position, activation, and staff tiers. */
describe('HubsService', () => {
  let ds: DataSource;
  let svc: HubsService;
  let world: Awaited<ReturnType<typeof geoWorld>>;
  let seq = 0;
  const emitter = { toRoles: jest.fn(), toUser: jest.fn(), toHub: jest.fn(), broadcast: jest.fn() };

  const mkUser = (role: User['role'], hubId: string | null, warehouseTier: User['warehouseTier'] = null) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `e${n}`, email: `u${n}@t.test`, passwordHash: 'x', name: `${role}${n}`, role, hubId, warehouseTier }));
  };

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    world = await geoWorld(ds, { emitter });
    svc = new HubsService(ds.getRepository(Hub), ds.getRepository(User), world.routing, emitter as never, world.geo, world.coverage);
    jest.clearAllMocks();
  });
  afterEach(async () => ds.destroy());

  describe('map position', () => {
    it('stores a valid latitude and longitude, and requires them when asked', async () => {
      const hub = await svc.save({ name: 'Gombe', city: 'Kinshasa', lat: '-4.3105', lng: 15.3136 }, { requirePosition: true });
      expect(hub).toMatchObject({ lat: -4.3105, lng: 15.3136 });
      await expect(svc.save({ name: 'Nowhere', city: 'Kinshasa' }, { requirePosition: true })).rejects.toThrow('Place the warehouse on the map: latitude and longitude are required.');
      // a legacy save without a position still works (the hub is simply never routed to)
      expect(await svc.save({ name: 'Unplaced', city: 'Kinshasa' })).toMatchObject({ lat: null, lng: null });
      expect((await svc.list()).find((h) => h.name === 'Unplaced')?.placed).toBe(false);
    });

    it('refuses an out-of-range or half-given position', async () => {
      await expect(svc.save({ name: 'Alpha', city: 'Kin', lat: 91, lng: 0 })).rejects.toThrow('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
      await expect(svc.save({ name: 'Alpha', city: 'Kin', lat: 0, lng: 181 })).rejects.toThrow('Enter a valid latitude');
      await expect(svc.save({ name: 'Alpha', city: 'Kin', lat: 10 })).rejects.toThrow('Enter a valid latitude');
    });

    it('edits a position, keeps the name unique and reports riders and staff per hub', async () => {
      const a = await svc.save({ name: 'Gombe', city: 'Kinshasa', lat: 1, lng: 1 });
      await mkUser('rider', a.id);
      await mkUser('warehouse_staff', a.id, 'operator');
      const moved = await svc.save({ id: a.id, lat: 2, lng: 3 });
      expect(moved).toMatchObject({ name: 'Gombe', lat: 2, lng: 3 });
      await expect(svc.save({ name: 'gombe', city: 'Xyz' })).rejects.toThrow('A hub with this name already exists.');
      const view = await svc.get(a.id);
      expect(view).toMatchObject({ activeRiders: 1, staffCount: 1, placed: true });
    });

    it('never switches off the last active hub', async () => {
      const a = await svc.save({ name: 'Alpha', city: 'Kin', lat: 1, lng: 1 });
      await expect(svc.setActive(a.id, false)).rejects.toThrow('You cannot deactivate the last active hub.');
      const b = await svc.save({ name: 'Bravo', city: 'Kin', lat: 2, lng: 2 });
      expect((await svc.setActive(a.id, false)).active).toBe(false);
      expect((await svc.list({ activeOnly: true })).map((h) => h.id)).toEqual([b.id]);
    });
  });

  describe('staff tiers', () => {
    it('a manager sets tiers at their own warehouse, but not their own, not a manager, not elsewhere', async () => {
      const a = await svc.save({ name: 'Alpha', city: 'Kin', lat: 1, lng: 1 });
      const b = await svc.save({ name: 'Bravo', city: 'Kin', lat: 2, lng: 2 });
      const mgr = await mkUser('warehouse_staff', a.id, 'manager');
      const op = await mkUser('warehouse_staff', a.id, 'operator');
      const other = await mkUser('warehouse_staff', b.id, 'operator');
      const actor = { id: mgr.id, role: 'warehouse_staff', hubId: a.id, tier: 'manager' };
      expect(await svc.setTier(actor, op.id, 'supervisor')).toEqual({ id: op.id, warehouseTier: 'supervisor' });
      await expect(svc.setTier(actor, mgr.id, 'operator')).rejects.toThrow('You cannot change your own tier.');
      await expect(svc.setTier(actor, op.id, 'manager')).rejects.toThrow('Only an administrator can make someone a manager.');
      await expect(svc.setTier(actor, other.id, 'supervisor')).rejects.toThrow('This person works at another warehouse.');
      await expect(svc.setTier(actor, op.id, 'boss')).rejects.toThrow('Tier must be one of');
    });

    it('supervisors and operators cannot change tiers; admins can make a manager', async () => {
      const a = await svc.save({ name: 'Alpha', city: 'Kin', lat: 1, lng: 1 });
      const sup = await mkUser('warehouse_staff', a.id, 'supervisor');
      const op = await mkUser('warehouse_staff', a.id, 'operator');
      await expect(svc.setTier({ id: sup.id, role: 'warehouse_staff', hubId: a.id, tier: 'supervisor' }, op.id, 'supervisor')).rejects.toThrow('Only managers can change staff tiers.');
      expect(await svc.setTier({ id: 'adm', role: 'admin' }, op.id, 'manager')).toEqual({ id: op.id, warehouseTier: 'manager' });
      await expect(svc.setTier({ id: 'adm', role: 'admin' }, (await mkUser('rider', a.id)).id, 'operator')).rejects.toThrow('Only warehouse staff have a tier.');
    });

    it('lists the people of a warehouse with their tier', async () => {
      const a = await svc.save({ name: 'Alpha', city: 'Kin', lat: 1, lng: 1 });
      await mkUser('warehouse_staff', a.id, null);
      await mkUser('rider', a.id);
      const people = await svc.people(a.id);
      expect(people.map((p) => [p.role, p.warehouseTier]).sort()).toEqual([['rider', null], ['warehouse_staff', 'operator']]);
    });
  });
});
