import { DataSource } from 'typeorm';
import { User } from '../database/entities';
import { testDb } from '../testing/test-db';
import { RiderComplianceGateway } from './rider-compliance.gateway';

const sock = (user?: { id: string; role: string; name?: string }) => ({ data: { user: user && { name: 'N', ...user } } }) as never;

let ds: DataSource;
let calls: string[];
let gw: RiderComplianceGateway;

beforeEach(async () => {
  ds = await testDb();
  calls = [];
  const svc = new Proxy({}, { get: (_t, name: string) => async (...args: unknown[]) => { calls.push(`${name}:${JSON.stringify(args)}`); return { name }; } });
  gw = new RiderComplianceGateway(svc as never, ds.getRepository(User));
});
afterEach(() => ds.destroy());

const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

describe('rider events are for the signed-in rider, about themselves', () => {
  it('pass the socket’s own id to the service, never an id from the payload', async () => {
    const s = sock({ id: 'r1', role: 'rider' });
    expect((await gw.vehicle(s)).ok).toBe(true);
    expect((await gw.documents(s)).ok).toBe(true);
    expect((await gw.upload(s, { type: 'other', fileId: 'f', riderId: 'someone-else' })).ok).toBe(true);
    expect(calls[0]).toBe('mineVehicle:["r1"]');
    expect(calls[1]).toBe('mineDocuments:["r1"]');
    expect(calls[2]).toBe('upload:["r1",{"type":"other","fileId":"f","riderId":"someone-else"}]'); // the service reads only type/number/expiresOn/fileId
  });
  it('refuse guests, staff and customers', async () => {
    for (const s of [sock(), sock({ id: 'g', role: 'guest' }), sock({ id: 'a', role: 'admin' }), sock({ id: 'w', role: 'warehouse_staff' }), sock({ id: 'c', role: 'customer' })]) {
      for (const r of [await gw.vehicle(s), await gw.documents(s), await gw.upload(s, {})]) expect(r.ok).toBe(false);
    }
    expect(await gw.vehicle(sock({ id: 'c', role: 'customer' }))).toEqual({ ok: false, error: 'Riders only.' });
    expect(calls).toEqual([]);
  });
});

describe('staff events', () => {
  it('refuse a rider, a customer, a seller and a guest before touching the service', async () => {
    for (const s of [sock(), sock({ id: 'g', role: 'guest' }), sock({ id: 'r', role: 'rider' }), sock({ id: 'c', role: 'customer' }), sock({ id: 's', role: 'seller' })]) {
      for (const r of [await gw.get(s, { riderId: 'x' }), await gw.updateVehicle(s, { riderId: 'x', model: 'm' }), await gw.review(s, { id: 'd', decision: 'approve' })]) expect(r.ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('an admin is passed through without a warehouse; the vehicle patch never contains the riderId', async () => {
    const s = sock({ id: 'a1', role: 'admin_operations', name: 'Ops' });
    await gw.get(s, { riderId: 'r9' });
    await gw.updateVehicle(s, { riderId: 'r9', model: 'm' });
    await gw.review(s, { id: 'd1', decision: 'reject', reason: 'blurry' });
    expect(calls[0]).toBe('staffView:[{"id":"a1","role":"admin_operations","name":"Ops","hubId":null,"tier":null},"r9"]');
    expect(calls[1]).toContain('updateVehicle:[{"id":"a1"');
    expect(calls[1]).toContain(',"r9",{"model":"m"}]');
    expect(calls[2]).toContain(',"d1","reject","blurry"]');
  });

  it('a warehouse member is resolved from the database (warehouse and tier), not from the socket', async () => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: 'e', email: 'e@t.test', passwordHash: 'x', name: 'W', role: 'warehouse_staff', hubId: 'hub-1', warehouseTier: 'supervisor' }));
    await gw.get(sock({ id: u.id, role: 'warehouse_staff', name: 'W' }), { riderId: 'r1' });
    expect(calls[0]).toContain('"hubId":"hub-1","tier":"supervisor"');
    // no warehouse, or switched off: refused
    await ds.getRepository(User).update({ id: u.id }, { hubId: null });
    expect(err(await gw.get(sock({ id: u.id, role: 'warehouse_staff' }), { riderId: 'r1' }))).toMatch(/not linked to a warehouse/);
    await ds.getRepository(User).update({ id: u.id }, { hubId: 'hub-1', active: false });
    expect(err(await gw.get(sock({ id: u.id, role: 'warehouse_staff' }), { riderId: 'r1' }))).toMatch(/not linked to a warehouse/);
  });
});
