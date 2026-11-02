import { RealtimeGateway } from './realtime.gateway';

/**
 * Least privilege on the socket: the admin sub-roles and the warehouse tiers the web menus hide pages from are refused
 * by the server, and the roles that own the feature (web/src/lib/admin-access.ts, warehouse-access.ts) still work.
 */
const as = (role: string, id = 'u1') => ({ data: { user: { id, role, name: `${role} name` } } }) as never;

const ADMIN_ROLES = ['admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation'];
const OTHER_ADMINS = (allowed: string[]) => ADMIN_ROLES.filter((r) => !allowed.includes(r));

/** Warehouse staff by user id: tier + warehouse as the database holds them. */
const STAFF: Record<string, { hubId: string; warehouseTier: string | null }> = {
  op: { hubId: 'h1', warehouseTier: 'operator' },
  none: { hubId: 'h1', warehouseTier: null },
  sup: { hubId: 'h1', warehouseTier: 'supervisor' },
  mgr: { hubId: 'h1', warehouseTier: 'manager' },
};

function gateway() {
  const products = {
    get: jest.fn(async () => ({ id: 'p1', sellerId: 'store1', status: 'pending', basePrice: 10, name: 'Lamp', sellerName: 'Shop' })),
    update: jest.fn(async (id: string, clean: { columns: object }) => ({ id, ...clean.columns })),
    remove: jest.fn(async () => ({ id: 'p1' })),
  };
  const campaigns = {
    setStatus: jest.fn(async (id: string, status: string) => ({ id, status })),
    create: jest.fn(async () => ({ id: 'c1' })),
    update: jest.fn(async () => ({ id: 'c1' })),
  };
  const warehouse = {
    aged: jest.fn(async () => []),
    reconcile: jest.fn(async () => []),
    listExceptions: jest.fn(async () => []),
    setExceptionStatus: jest.fn(async () => ({ id: 'e1' })),
    createException: jest.fn(async () => ({ id: 'e1' })),
  };
  const analytics = { warehouseStats: jest.fn(async () => ({ totalParcels: 3 })) };
  const users = { findById: jest.fn(async (id: string) => STAFF[id] ?? null) };
  const sellersSvc = { byUser: jest.fn(async () => null), get: jest.fn(async () => ({ userId: 'owner' })) };
  const notifications = { toUser: jest.fn(async () => undefined), toAdmins: jest.fn(async () => undefined) };
  const kit = { ctx: { resolve: jest.fn(async () => ({ seller: { id: 'store1', status: 'approved' }, actor: { id: 'owner', name: 'Shop', role: 'seller' } })) } };
  const settings = { get: jest.fn(async () => 'true') };
  // Moderation and campaign decisions are audited (admin-audit.spec.ts covers the entries themselves).
  const audit = { record: jest.fn(async () => undefined) };
  const gw = Object.assign(Object.create(RealtimeGateway.prototype), { products, campaigns, warehouse, analytics, users, sellersSvc, notifications, kit, settings, audit }) as RealtimeGateway;
  return { gw, products, campaigns, warehouse, analytics };
}

describe('product moderation (products:update, products:delete)', () => {
  const MODERATORS = ['admin', 'admin_moderation'];

  it('approve / reject / block / un-remove is for the Super Admin and Moderation only; the other admin roles are refused and nothing is written', async () => {
    const { gw, products } = gateway();
    for (const role of OTHER_ADMINS(MODERATORS)) {
      for (const status of ['live', 'rejected', 'blocked', 'draft']) {
        expect(await gw.productsUpdate(as(role), { id: 'p1', patch: { status } })).toEqual({ ok: false, error: 'You can only edit your own products.' });
      }
    }
    expect(products.update).not.toHaveBeenCalled();
    for (const role of MODERATORS) {
      const res = await gw.productsUpdate(as(role), { id: 'p1', patch: { status: 'live' } });
      expect(res).toMatchObject({ ok: true, data: { id: 'p1', status: 'live' } });
    }
    expect(products.update).toHaveBeenCalledTimes(2);
  });

  it('a moderator’s decision tells the store owner; a refused role tells nobody', async () => {
    const { gw } = gateway();
    const notified = (gw as unknown as { notifications: { toUser: jest.Mock } }).notifications.toUser;
    await gw.productsUpdate(as('admin_finance'), { id: 'p1', patch: { status: 'live' } });
    expect(notified).not.toHaveBeenCalled();
    await gw.productsUpdate(as('admin_moderation'), { id: 'p1', patch: { status: 'rejected' } });
    expect(notified).toHaveBeenCalledWith('owner', expect.objectContaining({ title: 'Product rejected' }));
  });

  it('other admin roles cannot edit or remove another seller’s listing either', async () => {
    const { gw, products } = gateway();
    for (const role of OTHER_ADMINS(MODERATORS)) {
      expect(await gw.productsUpdate(as(role), { id: 'p1', patch: { price: 5 } })).toEqual({ ok: false, error: 'You can only edit your own products.' });
      expect(await gw.productsDelete(as(role), { id: 'p1' })).toEqual({ ok: false, error: 'You can only remove your own products.' });
    }
    expect(products.update).not.toHaveBeenCalled();
    expect(products.remove).not.toHaveBeenCalled();
    for (const role of MODERATORS) expect((await gw.productsDelete(as(role), { id: 'p1' })).ok).toBe(true);
    expect(products.remove).toHaveBeenCalledTimes(2);
  });

  it('a seller still edits their own listing but cannot approve it', async () => {
    const { gw, products } = gateway();
    expect((await gw.productsUpdate(as('seller', 'owner'), { id: 'p1', patch: { price: 12 } })).ok).toBe(true);
    expect(await gw.productsUpdate(as('seller', 'owner'), { id: 'p1', patch: { status: 'live' } })).toEqual({ ok: false, error: "Only a moderator can change this listing's status." });
    expect(products.update).toHaveBeenCalledTimes(1);
  });
});

describe('campaigns (campaigns:setStatus, create, update)', () => {
  const MARKETING = ['admin', 'admin_marketing'];

  it('approve / reject is for the Super Admin and Marketing only', async () => {
    const { gw, campaigns } = gateway();
    for (const role of [...OTHER_ADMINS(MARKETING), 'seller', 'customer', 'warehouse_staff', 'rider']) {
      expect(await gw.campaignsSetStatus(as(role), { id: 'c1', status: 'active' })).toEqual({ ok: false, error: 'Only marketing can decide on campaigns.' });
    }
    expect(campaigns.setStatus).not.toHaveBeenCalled();
    for (const role of MARKETING) expect(await gw.campaignsSetStatus(as(role), { id: 'c1', status: 'rejected', reason: 'No' })).toMatchObject({ ok: true });
    expect(campaigns.setStatus).toHaveBeenCalledTimes(2);
  });

  it('running a campaign as the platform is Marketing’s too; sellers still create and edit their own', async () => {
    const { gw, campaigns } = gateway();
    for (const role of OTHER_ADMINS(MARKETING)) {
      expect(await gw.campaignsCreate(as(role), { name: 'Sale' })).toEqual({ ok: false, error: 'Only sellers or marketing can create campaigns.' });
      expect(await gw.campaignsUpdate(as(role), { id: 'c1', patch: {} })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(campaigns.create).not.toHaveBeenCalled();
    expect(campaigns.update).not.toHaveBeenCalled();
    for (const role of MARKETING) {
      expect((await gw.campaignsCreate(as(role), { name: 'Sale' })).ok).toBe(true);
      expect((await gw.campaignsUpdate(as(role), { id: 'c1', patch: {} })).ok).toBe(true);
    }
  });
});

describe('warehouse tiers on the socket', () => {
  const tierRefusal = 'Only supervisors and managers can see this.';

  it('aged parcels and COD cash: supervisor and above; admins keep full access; others are refused', async () => {
    const { gw, warehouse } = gateway();
    for (const id of ['op', 'none']) {
      expect(await gw.whAged(as('warehouse_staff', id), {})).toEqual({ ok: false, error: tierRefusal });
      expect(await gw.whReconcile(as('warehouse_staff', id), {})).toEqual({ ok: false, error: tierRefusal });
    }
    for (const role of ['customer', 'seller', 'rider']) {
      expect((await gw.whAged(as(role), {})).ok).toBe(false);
      expect((await gw.whReconcile(as(role), {})).ok).toBe(false);
    }
    expect(warehouse.aged).not.toHaveBeenCalled();
    expect(warehouse.reconcile).not.toHaveBeenCalled();
    for (const [role, id] of [['warehouse_staff', 'sup'], ['warehouse_staff', 'mgr'], ['admin', 'a'], ['admin_operations', 'a']] as const) {
      expect((await gw.whAged(as(role, id), {})).ok).toBe(true);
      expect((await gw.whReconcile(as(role, id), {})).ok).toBe(true);
    }
  });

  it('incidents: the list and the status are supervisor pages; an operator reads the incidents of one parcel and can still raise one', async () => {
    const { gw, warehouse } = gateway();
    expect(await gw.exceptionsList(as('warehouse_staff', 'op'), {})).toEqual({ ok: false, error: tierRefusal });
    expect(await gw.exceptionsList(as('warehouse_staff', 'op'), { status: 'open' })).toEqual({ ok: false, error: tierRefusal });
    expect(await gw.exceptionsSetStatus(as('warehouse_staff', 'op'), { id: 'e1', status: 'resolved' })).toEqual({ ok: false, error: 'Only supervisors and managers can do this.' });
    expect(warehouse.listExceptions).not.toHaveBeenCalled();
    expect(warehouse.setExceptionStatus).not.toHaveBeenCalled();
    // One parcel's incidents, still limited to the operator's own warehouse.
    expect((await gw.exceptionsList(as('warehouse_staff', 'op'), { taskId: 't1' })).ok).toBe(true);
    expect(warehouse.listExceptions).toHaveBeenLastCalledWith(undefined, 'h1', 't1');
    expect((await gw.exceptionsCreate(as('warehouse_staff', 'op'), { notes: 'Box crushed' })).ok).toBe(true);
    for (const [role, id] of [['warehouse_staff', 'sup'], ['warehouse_staff', 'mgr'], ['admin', 'a'], ['admin_operations', 'a']] as const) {
      expect((await gw.exceptionsList(as(role, id), {})).ok).toBe(true);
      expect((await gw.exceptionsSetStatus(as(role, id), { id: 'e1', status: 'resolved' })).ok).toBe(true);
    }
    expect(warehouse.listExceptions).toHaveBeenCalledWith(undefined, 'h1', null);
    expect(warehouse.listExceptions).toHaveBeenCalledWith(undefined, null, null); // admins: every warehouse
  });

  it('warehouse analytics: managers and admins only', async () => {
    const { gw, analytics } = gateway();
    for (const id of ['op', 'none', 'sup']) {
      expect(await gw.analyticsWarehouse(as('warehouse_staff', id), {})).toEqual({ ok: false, error: 'Only managers can see this.' });
    }
    expect(await gw.analyticsWarehouse(as('rider'), {})).toEqual({ ok: false, error: 'Staff only.' });
    expect(analytics.warehouseStats).not.toHaveBeenCalled();
    for (const [role, id] of [['warehouse_staff', 'mgr'], ['admin', 'a'], ['admin_finance', 'a']] as const) {
      expect(await gw.analyticsWarehouse(as(role, id), {})).toEqual({ ok: true, data: { totalParcels: 3 } });
    }
  });
});
