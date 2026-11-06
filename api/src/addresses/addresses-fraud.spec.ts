import { DataSource } from 'typeorm';
import { Address, ENTITIES, FraudSignal, Hub, Order } from '../database/entities';
import { FraudSignalsService } from '../ops/fraud-signals.service';
import { geoWorld } from '../testing/geo-world';
import { AddressesService } from './addresses.service';

/** Changing a delivery address while an order is on its way is counted for the fraud rules; nothing else is. */
describe('addresses feed the fraud signals', () => {
  let ds: DataSource;
  let svc: AddressesService;
  let geo: Awaited<ReturnType<typeof geoWorld>>['geo'];
  const count = () => ds.getRepository(FraudSignal).count({ where: { kind: 'address_change' } });
  const order = (status: Order['status']) =>
    ds.getRepository(Order).save(ds.getRepository(Order).create({ reference: `SOM-${Math.random()}`, customerId: 'u1', customerName: 'U', status, paymentMethod: 'wallet', totalUsd: 1 }));

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    const w = await geoWorld(ds);
    const hub = await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'K', city: 'Kinshasa', active: true }));
    await w.coverage.assign({ hubId: hub.id, areaIds: [(await w.area('CD-KN')).id] });
    geo = w.geo;
    const signals = new FraudSignalsService(ds.getRepository(FraudSignal), ds.getRepository(Order));
    svc = new AddressesService(ds.getRepository(Address), { toUser: () => undefined } as never, w.geo, signals);
  });
  afterEach(async () => ds.destroy());

  it('adding or moving an address with an order on its way is a signal; without one it is not', async () => {
    const a = await svc.create('u1', { line1: '1 Rue', city: 'Kinshasa' });
    expect(await count()).toBe(0);
    await order('shipped');
    await svc.update('u1', a.id, { line1: '2 Rue' });
    expect(await count()).toBe(1);
    await svc.create('u1', { line1: '3 Rue', city: 'Kinshasa' });
    expect(await count()).toBe(2);
  });

  it('a label or default-flag edit, or saving the same address again, is not a change', async () => {
    const a = await svc.create('u1', { line1: '1 Rue', city: 'Kinshasa', label: 'Home' });
    await order('out_for_delivery');
    await svc.update('u1', a.id, { label: 'Work', isDefault: true });
    await svc.update('u1', a.id, { line1: '1 Rue', label: 'Work' });
    expect(await count()).toBe(0);
    await svc.update('u1', a.id, { line1: '9 Autre Rue' });
    expect(await count()).toBe(1);
  });

  it('works without the recorder (it is optional) and never fails the address save', async () => {
    const plain = new AddressesService(ds.getRepository(Address), { toUser: () => undefined } as never, geo);
    expect(await plain.create('u2', { line1: '1', city: 'Kinshasa' })).toMatchObject({ line1: '1' });
    const broken = new AddressesService(ds.getRepository(Address), { toUser: () => undefined } as never, geo, new FraudSignalsService({ save: async () => { throw new Error('db'); } } as never, { count: async () => 1 } as never));
    expect(await broken.create('u3', { line1: '1', city: 'Kinshasa' })).toMatchObject({ line1: '1' });
  });
});
