import { WarehouseStockGateway } from './warehouse-stock.gateway';

type Row = { id: string; hubId: string | null; warehouseTier: string | null; active: boolean };
const gateway = (row: Row | null, calls: string[] = []) => {
  const stock = new Proxy({}, { get: (_t, name: string) => async (a: { role: string; hubId?: string | null; tier?: string | null }) => { calls.push(`${name}:${a.role}:${a.hubId ?? '-'}:${a.tier ?? '-'}`); return { done: name }; } });
  const users = { findOne: async () => row };
  return new WarehouseStockGateway(stock as never, users as never);
};
const sock = (user?: { id: string; role: string; name: string }) => ({ data: { user }, id: `s-${Math.random()}`, handshake: { address: '127.0.0.1' } }) as never;

describe('WarehouseStockGateway', () => {
  it('answers { ok: false, error } for guests, riders, customers, sellers and anyone not signed in', async () => {
    const g = gateway(null);
    expect(await g.onHand(sock(), {})).toEqual({ ok: false, error: 'Sign in to continue.' });
    expect(await g.onHand(sock({ id: 'g', role: 'guest', name: 'G' }), {})).toEqual({ ok: false, error: 'Sign in to continue.' });
    for (const role of ['rider', 'customer', 'seller']) expect(await g.receive(sock({ id: 'x', role, name: 'X' }), {})).toEqual({ ok: false, error: 'Staff only.' });
  });

  it('refuses a staff account with no warehouse or a switched-off account', async () => {
    const u = { id: 'w1', role: 'warehouse_staff', name: 'W' };
    expect(await gateway({ id: 'w1', hubId: null, warehouseTier: 'manager', active: true }).bins(sock(u))).toEqual({ ok: false, error: 'Your account is not linked to a warehouse. Ask an administrator.' });
    expect(await gateway({ id: 'w1', hubId: 'h1', warehouseTier: 'manager', active: false }).bins(sock(u))).toEqual({ ok: false, error: 'Your account is not linked to a warehouse. Ask an administrator.' });
    expect(await gateway(null).bins(sock(u))).toMatchObject({ ok: false });
  });

  it('takes the warehouse and the tier from the database, not from the socket', async () => {
    const calls: string[] = [];
    const g = gateway({ id: 'w1', hubId: 'hub-9', warehouseTier: 'supervisor', active: true }, calls);
    expect(await g.count(sock({ id: 'w1', role: 'warehouse_staff', name: 'W' }), { hubId: 'someone-elses' })).toEqual({ ok: true, data: { done: 'count' } });
    expect(calls).toEqual(['count:warehouse_staff:hub-9:supervisor']);
  });

  it('an unknown tier counts as operator (least privilege), and an admin carries no warehouse', async () => {
    const calls: string[] = [];
    await gateway({ id: 'w1', hubId: 'h', warehouseTier: 'bogus', active: true }, calls).move(sock({ id: 'w1', role: 'warehouse_staff', name: 'W' }), {});
    await gateway(null, calls).history(sock({ id: 'a', role: 'admin_operations', name: 'A' }), {});
    expect(calls).toEqual(['move:warehouse_staff:h:operator', 'history:admin_operations:-:-']);
  });
});
