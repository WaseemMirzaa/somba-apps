import { RealtimeGateway } from './realtime.gateway';
import { DESK_ADMINS_ONLY } from '../logistics/tiers';
import { ORDER_ACCESS_DENIED } from '../common/order-access';

/**
 * The warehouse events on the main socket (`delivery:*`, `warehouse:*`, `exceptions:*`, `orders:list`): only the desk admins
 * (super admin, operations) and warehouse staff may use them. Marketing, moderation, support and finance are refused with one
 * clear sentence, and the services behind are never called. Finance keeps what its own screens need (rider cash, the warehouse
 * figures, orders without addresses). Built without the constructor, like `role-permissions.spec.ts`.
 */
const as = (role: string, id = `${role}-1`) => ({ data: { user: { id, role, name: `${role} name` } } }) as never;

const OTHER_ADMINS = ['admin_marketing', 'admin_moderation', 'admin_support', 'admin_finance'];
const DESK_ADMINS = ['admin', 'admin_operations'];

/** Warehouse staff by user id: tier + warehouse as the database holds them. */
const STAFF: Record<string, { id: string; hubId: string; warehouseTier: string; active: boolean; role: string; name: string }> = {
  op: { id: 'op', hubId: 'h1', warehouseTier: 'operator', active: true, role: 'warehouse_staff', name: 'Operator' },
  sup: { id: 'sup', hubId: 'h1', warehouseTier: 'supervisor', active: true, role: 'warehouse_staff', name: 'Supervisor' },
  mgr: { id: 'mgr', hubId: 'h1', warehouseTier: 'manager', active: true, role: 'warehouse_staff', name: 'Manager' },
  rider1: { id: 'rider1', hubId: 'h1', warehouseTier: 'operator', active: true, role: 'rider', name: 'Rider' },
};

function gateway() {
  const delivery = {
    listAll: jest.fn(async () => [{ id: 't1', address: '12 Rue du Lac' }]),
    listUnassigned: jest.fn(async () => [{ id: 't2', address: '3 Avenue de la Paix' }]),
    listForRider: jest.fn(async () => []),
  };
  const logistics = {
    getTask: jest.fn(async () => ({ id: 't1', toHubId: 'h1', fromHubId: 'h1', hubId: 'h1' })),
    onScanIn: jest.fn(async () => ({ task: { id: 't1', status: 'delivered' }, next: [] })),
    assign: jest.fn(async () => ({ id: 't1', status: 'assigned' })),
  };
  const warehouse = {
    listHubs: jest.fn(async () => []),
    parcels: jest.fn(async () => []),
    aged: jest.fn(async () => []),
    inventory: jest.fn(async () => []),
    listBatches: jest.fn(async () => []),
    buildBatch: jest.fn(async () => ({ id: 'b1' })),
    reconcile: jest.fn(async () => [{ riderId: 'r1', heldUsd: 3 }]),
    listExceptions: jest.fn(async () => []),
    createException: jest.fn(async () => ({ id: 'e1' })),
    setExceptionStatus: jest.fn(async () => ({ id: 'e1' })),
  };
  const rider = { activeRiders: jest.fn(async () => []) };
  const analytics = { warehouseStats: jest.fn(async () => ({ totalParcels: 3 })) };
  const orders = { list: jest.fn(async () => [{ id: 'o1' }]) };
  const users = {
    findById: jest.fn(async (id: string) => (id === 'rider-active' ? { id, role: 'rider', active: true, hubId: 'h1' } : (STAFF[id] ?? null))),
  };
  const gw = Object.assign(Object.create(RealtimeGateway.prototype), { delivery, logistics, warehouse, rider, analytics, orders, users }) as RealtimeGateway;
  return { gw, delivery, logistics, warehouse, rider, analytics, orders };
}

/** Every desk event of this gateway, with a body that would work for a desk admin. */
function calls(gw: RealtimeGateway) {
  return {
    'delivery:list': (c: never) => gw.deliveryList(c, {}),
    'delivery:unassigned': (c: never) => gw.deliveryUnassigned(c, {}),
    'warehouse:receive': (c: never) => gw.warehouseReceive(c, { taskId: 't1' }),
    'warehouse:riders': (c: never) => gw.warehouseRiders(c, {}),
    'warehouse:hubs': (c: never) => gw.whHubs(c, {}),
    'warehouse:parcels': (c: never) => gw.whParcels(c, {}),
    'warehouse:aged': (c: never) => gw.whAged(c, {}),
    'warehouse:inventory': (c: never) => gw.whInventory(c, {}),
    'warehouse:batches': (c: never) => gw.whBatches(c, {}),
    'warehouse:buildBatch': (c: never) => gw.whBuildBatch(c, { taskIds: ['t1'], riderId: 'rider-active' }),
    'exceptions:list': (c: never) => gw.exceptionsList(c, {}),
    'exceptions:create': (c: never) => gw.exceptionsCreate(c, { notes: 'Box crushed', type: 'damaged' } as never),
    'exceptions:setStatus': (c: never) => gw.exceptionsSetStatus(c, { id: 'e1', status: 'resolved' }),
    'delivery:assign': (c: never) => gw.deliveryAssign(c, { taskId: 't1', riderId: 'rider-active' }),
  };
}

describe('warehouse events on the main socket', () => {
  it.each(OTHER_ADMINS)('%s is refused at every one of them, and no service is called', async (role) => {
    const { gw, delivery, logistics, warehouse, rider } = gateway();
    for (const [event, call] of Object.entries(calls(gw))) {
      expect([event, await call(as(role))]).toEqual([event, { ok: false, error: DESK_ADMINS_ONLY }]);
    }
    for (const fn of [...Object.values(delivery), ...Object.values(logistics), ...Object.values(warehouse), ...Object.values(rider)]) expect(fn).not.toHaveBeenCalled();
  });

  it.each([...DESK_ADMINS, 'warehouse_staff'])('%s still gets every one of them (warehouse staff by tier)', async (role) => {
    const { gw } = gateway();
    // a manager can do everything on this list
    const socket = role === 'warehouse_staff' ? as(role, 'mgr') : as(role);
    for (const [event, call] of Object.entries(calls(gw))) {
      const res = (await call(socket)) as { ok: boolean; error?: string };
      expect([event, res.ok, res.error]).toEqual([event, true, undefined]);
    }
  });

  it('warehouse staff keep the tier rules (an operator cannot assign or build a batch) and are scoped to their warehouse', async () => {
    const { gw, delivery, warehouse, logistics } = gateway();
    expect(await gw.deliveryAssign(as('warehouse_staff', 'op'), { taskId: 't1', riderId: 'rider-active' })).toMatchObject({ ok: true });
    // (the tier of the assign is enforced by LogisticsService.assign, covered in logistics/warehouse-role-access.spec.ts)
    expect(logistics.assign).toHaveBeenCalledWith('t1', 'rider-active', expect.objectContaining({ role: 'warehouse_staff', hubId: 'h1', tier: 'operator' }));
    expect(await gw.whAged(as('warehouse_staff', 'op'), {})).toEqual({ ok: false, error: 'Only supervisors and managers can see this.' });
    expect(warehouse.aged).not.toHaveBeenCalled();
    await gw.deliveryList(as('warehouse_staff', 'sup'), { hubId: 'h2' } as never);
    expect(delivery.listAll).toHaveBeenCalledWith({ hubId: 'h2' }, 'h1'); // the hub they ask for is ignored: their own
  });

  it('riders and customers are refused too, with the same sentence', async () => {
    const { gw } = gateway();
    for (const role of ['customer', 'seller']) {
      for (const [event, call] of Object.entries(calls(gw))) {
        expect([event, await call(as(role))]).toEqual([event, { ok: false, error: DESK_ADMINS_ONLY }]);
      }
    }
  });

  it('a rider still lists only their own tasks', async () => {
    const { gw, delivery } = gateway();
    expect(await gw.deliveryList(as('rider', 'rider1'), {})).toMatchObject({ ok: true });
    expect(delivery.listForRider).toHaveBeenCalledWith('rider1', {});
    expect(delivery.listAll).not.toHaveBeenCalled();
    expect(await gw.deliveryUnassigned(as('rider', 'rider1'), {})).toEqual({ ok: true, data: [] });
  });
});

describe('what finance and the others still read in the warehouse', () => {
  it('rider cash (warehouse:reconcile): super admin, operations and finance read it; support, marketing and moderation do not', async () => {
    const { gw, warehouse } = gateway();
    for (const role of ['admin', 'admin_operations', 'admin_finance']) expect(await gw.whReconcile(as(role), {})).toMatchObject({ ok: true });
    expect(warehouse.reconcile).toHaveBeenCalledTimes(3);
    warehouse.reconcile.mockClear();
    for (const role of ['admin_support', 'admin_marketing', 'admin_moderation']) expect(await gw.whReconcile(as(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.whReconcile(as('warehouse_staff', 'op'), {})).toEqual({ ok: false, error: 'Only supervisors and managers can see this.' });
    expect(warehouse.reconcile).not.toHaveBeenCalled();
  });

  it('warehouse figures (analytics:warehouse): super admin, operations and finance (their analytics page); not support, marketing or moderation', async () => {
    const { gw, analytics } = gateway();
    for (const role of ['admin', 'admin_operations', 'admin_finance']) expect(await gw.analyticsWarehouse(as(role), {})).toMatchObject({ ok: true });
    expect(analytics.warehouseStats).toHaveBeenCalledTimes(3);
    analytics.warehouseStats.mockClear();
    for (const role of ['admin_support', 'admin_marketing', 'admin_moderation']) expect(await gw.analyticsWarehouse(as(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.analyticsWarehouse(as('warehouse_staff', 'sup'), {})).toEqual({ ok: false, error: 'Only managers can see this.' });
    expect(analytics.warehouseStats).not.toHaveBeenCalled();
  });
});

describe('orders:list at the socket', () => {
  it('marketing is refused outright; the service is not asked', async () => {
    const { gw, orders } = gateway();
    expect(await gw.ordersList(as('admin_marketing'), {})).toEqual({ ok: false, error: ORDER_ACCESS_DENIED });
    expect(orders.list).not.toHaveBeenCalled();
  });

  it('operations, support, finance, moderation and the super admin are served (the service decides what each sees of the address)', async () => {
    const { gw, orders } = gateway();
    for (const role of ['admin', 'admin_operations', 'admin_support', 'admin_finance', 'admin_moderation']) expect(await gw.ordersList(as(role), {})).toMatchObject({ ok: true });
    expect(orders.list.mock.calls.map((c: unknown[]) => (c[0] as { role: string }).role)).toEqual(['admin', 'admin_operations', 'admin_support', 'admin_finance', 'admin_moderation']);
  });
});
