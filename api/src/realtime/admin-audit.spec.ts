import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEmitter } from './realtime-emitter';

/**
 * Admin moderation and money actions leave an audit entry, and the fraud "Block" goes through the same permission
 * as `customers:setActive`. The gateway has dozens of collaborators; each test builds it without its constructor.
 */
describe('admin actions are audited (gateway)', () => {
  let audit: { record: jest.Mock; list: jest.Mock; facets: jest.Mock };
  let gw: RealtimeGateway;
  const as = (role: string, id = 'a1') => ({ data: { user: { id, role, name: `${role} name` } } }) as never;
  const entries = () => audit.record.mock.calls.map(([e]) => `${e.action}|${e.entity}|${e.entityId ?? ''}`);

  beforeEach(() => {
    audit = { record: jest.fn(async () => undefined), list: jest.fn(async () => []), facets: jest.fn(async () => ({ actions: [], roles: [] })) };
    gw = Object.assign(Object.create(RealtimeGateway.prototype), { audit });
  });

  it('a broadcast is audited with its audience and recipient count; a refused caller leaves nothing', async () => {
    const broadcasts = { send: jest.fn(async () => ({ id: 'b1', audience: 'customer', recipients: 7, title: 'Sale' })) };
    Object.assign(gw, { broadcasts });
    expect(await gw.broadcastsSend(as('customer'), { title: 'x', body: 'y' })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.broadcastsSend(as('admin_finance'), { title: 'x', body: 'y' })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(audit.record).not.toHaveBeenCalled();
    expect(await gw.broadcastsSend(as('admin_marketing'), { title: 'Sale', body: 'y' })).toMatchObject({ ok: true });
    expect(entries()).toEqual(['broadcast.sent|broadcast|b1']);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ actor: 'admin_marketing name', role: 'admin_marketing', detail: 'customer · 7 recipients · Sale' });
  });

  it('a broadcast the service refuses is not audited', async () => {
    Object.assign(gw, { broadcasts: { send: jest.fn(async () => { throw new Error('Enter a title in English or French.'); }) } });
    expect(await gw.broadcastsSend(as('admin'), { title: '', body: '' })).toEqual({ ok: false, error: 'Enter a title in English or French.' });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a campaign decision is audited with the status and the reason', async () => {
    Object.assign(gw, { campaigns: { setStatus: jest.fn(async () => ({ id: 'c1', name: 'Eid sale' })) } });
    expect(await gw.campaignsSetStatus(as('seller'), { id: 'c1', status: 'active' })).toEqual({ ok: false, error: 'Only marketing can decide on campaigns.' });
    expect(audit.record).not.toHaveBeenCalled();
    expect(await gw.campaignsSetStatus(as('admin_marketing'), { id: 'c1', status: 'rejected', reason: 'Misleading' })).toMatchObject({ ok: true });
    expect(entries()).toEqual(['campaign.rejected|campaign|c1']);
    expect(audit.record.mock.calls[0][0].detail).toBe('Eid sale · Misleading');
  });

  it('a payout rejection, a dispute-free money action by finance, is audited; other roles are refused', async () => {
    Object.assign(gw, { payouts: { reject: jest.fn(async () => ({ id: 'p1', reference: 'PO-1' })) } });
    expect(await gw.payoutsReject(as('admin_support'), { payoutId: 'p1' })).toMatchObject({ ok: false });
    expect(audit.record).not.toHaveBeenCalled();
    expect(await gw.payoutsReject(as('admin_finance'), { payoutId: 'p1', note: 'Wrong number' })).toMatchObject({ ok: true });
    expect(entries()).toEqual(['payout.rejected|payout|p1']);
    expect(audit.record.mock.calls[0][0].detail).toBe('PO-1 · Wrong number');
  });

  it('flash sale creation, CMS edits and category changes are audited', async () => {
    Object.assign(gw, {
      promos: { createFlashSale: jest.fn(async () => ({ id: 'f1', title: 'Weekend' })) },
      cms: { upsert: jest.fn(async () => ({ key: 'home' })) },
      categories: {
        create: jest.fn(async () => ({ id: 'k1', name: 'Shoes' })),
        update: jest.fn(async () => ({ id: 'k1', name: 'Sneakers' })),
        remove: jest.fn(async () => undefined),
      },
    });
    await gw.flashSalesCreate(as('admin_marketing'), { title: 'Weekend' });
    await gw.cmsUpsert(as('admin_marketing'), { key: 'home' });
    await gw.categoriesCreate(as('admin_operations'), { name: 'Shoes' });
    await gw.categoriesUpdate(as('admin_operations'), { id: 'k1', patch: {} });
    await gw.categoriesRemove(as('admin_operations'), { id: 'k1' });
    expect(entries()).toEqual(['flashsale.create|flashsale|f1', 'cms.upsert|cms|home', 'category.create|category|k1', 'category.update|category|k1', 'category.remove|category|k1']);
    // A refused role writes nothing.
    audit.record.mockClear();
    expect(await gw.categoriesRemove(as('admin_finance'), { id: 'k1' })).toMatchObject({ ok: false });
    expect(await gw.cmsUpsert(as('admin_finance'), { key: 'home' })).toMatchObject({ ok: false });
    expect(audit.record).not.toHaveBeenCalled();
  });

  describe('products', () => {
    const live = { id: 'pr1', name: 'Phone', status: 'live', sellerId: 'seller-1', basePrice: 10 };
    beforeEach(() => {
      Object.assign(gw, {
        products: { get: jest.fn(async () => live), update: jest.fn(async () => ({ ...live, status: 'rejected' })), remove: jest.fn(async () => ({ id: 'pr1' })) },
        sellersSvc: { byUser: jest.fn(async () => null), get: jest.fn(async () => ({ userId: 'owner-1' })) },
        notifications: { toUser: jest.fn(async () => undefined), toAdmins: jest.fn(async () => undefined) },
        settings: { get: jest.fn(async () => 'true') },
        categories: { resolveRef: jest.fn(async () => undefined) },
      });
    });

    it('a moderator changing a status (reject, block, approve) is audited with the old status; a no-op is not', async () => {
      await gw.productsUpdate(as('admin_moderation'), { id: 'pr1', patch: { status: 'rejected' } });
      expect(entries()).toEqual(['product.rejected|product|pr1']);
      expect(audit.record.mock.calls[0][0].detail).toBe('Phone (was live)');
      audit.record.mockClear();
      await gw.productsUpdate(as('admin'), { id: 'pr1', patch: { status: 'live' } }); // already live
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('a seller cannot change a moderation status, and a refused attempt is not audited', async () => {
      const res = await gw.productsUpdate(as('seller', 'owner-1'), { id: 'pr1', patch: { status: 'rejected' } });
      expect(res).toMatchObject({ ok: false });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('an admin removing someone else\'s listing is audited; the owner removing their own is not', async () => {
      await gw.productsDelete(as('admin_moderation'), { id: 'pr1' });
      expect(entries()).toEqual(['product.removed|product|pr1']);
      audit.record.mockClear();
      Object.assign(gw, { sellersSvc: { byUser: jest.fn(async () => ({ id: 'seller-1' })) } });
      Object.assign(gw, { kit: { ctx: { resolve: jest.fn(async () => ({ seller: { id: 'seller-1' } })) } } });
      await gw.productsDelete(as('seller', 'owner-1'), { id: 'pr1' });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});

describe('audit:list and audit:facets (gateway)', () => {
  const as = (role: string) => ({ data: { user: { id: 'a1', role, name: role } } }) as never;
  let audit: { list: jest.Mock; facets: jest.Mock };
  let gw: RealtimeGateway;
  beforeEach(() => {
    audit = { list: jest.fn(async () => [{ id: 'l1' }]), facets: jest.fn(async () => ({ actions: ['a'], roles: ['admin'] })) };
    gw = Object.assign(Object.create(RealtimeGateway.prototype), { audit });
  });

  it('passes the filters to the service for the roles that may read the log, and refuses the rest', async () => {
    const filter = { action: 'user.suspend', role: 'admin', from: '2026-01-01', to: '2026-02-01', limit: 25, offset: 50 };
    for (const role of ['admin', 'admin_operations']) {
      expect(await gw.auditList(as(role), filter)).toEqual({ ok: true, data: [{ id: 'l1' }] });
      expect(await gw.auditFacets(as(role))).toMatchObject({ ok: true });
    }
    expect(audit.list).toHaveBeenCalledWith(filter);
    audit.list.mockClear();
    for (const role of ['admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation', 'warehouse_staff', 'rider', 'seller', 'customer']) {
      expect(await gw.auditList(as(role), filter)).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.auditFacets(as(role))).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(audit.list).not.toHaveBeenCalled();
  });

  it('a bad filter is the ack error', async () => {
    audit.list.mockRejectedValueOnce(new Error('From must be a valid date.'));
    expect(await gw.auditList(as('admin'), { from: 'x' })).toEqual({ ok: false, error: 'From must be a valid date.' });
  });
});

describe('fraud:setStatus and customers:wallet (gateway)', () => {
  let fraud: { setStatus: jest.Mock };
  let customers: { wallet: jest.Mock; setActive: jest.Mock };
  let audit: { record: jest.Mock };
  let disconnectSockets: jest.Mock;
  let room: jest.Mock;
  let gw: RealtimeGateway;
  const as = (role: string, id = 'a1') => ({ data: { user: { id, role, name: `${role} name` } } }) as never;

  beforeEach(() => {
    fraud = { setStatus: jest.fn(async (id: string, status: string) => ({ alert: { id, status }, kickUserId: status === 'blocked' ? 'c1' : undefined })) };
    customers = { wallet: jest.fn(async () => ({ balance: 12.5, transactions: [] })), setActive: jest.fn(async () => undefined) };
    audit = { record: jest.fn(async () => undefined) };
    disconnectSockets = jest.fn();
    room = jest.fn(() => ({ disconnectSockets }));
    gw = Object.assign(Object.create(RealtimeGateway.prototype), { fraud, customers, audit, server: { in: room } });
  });

  it('Block carries the suspend right and the confirmation to the service, and drops the customer\'s live sockets', async () => {
    const res = await gw.fraudSetStatus(as('admin', 's1'), { id: 'f1', status: 'blocked', confirm: true });
    expect(res).toEqual({ ok: true, data: { id: 'f1', status: 'blocked' } });
    expect(fraud.setStatus).toHaveBeenCalledWith('f1', 'blocked', { id: 's1', name: 'admin name', role: 'admin', canSuspend: true, confirmed: true });
    expect(room).toHaveBeenCalledWith(RealtimeEmitter.userRoom('c1'));
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('only the roles behind customers:setActive can suspend: the fraud group\'s other roles are passed as unable', async () => {
    // The fraud group is admin, finance, operations, moderation and support; of those only the super admin and support may suspend accounts.
    for (const role of ['admin_finance', 'admin_operations', 'admin_moderation']) {
      await gw.fraudSetStatus(as(role), { id: 'f1', status: 'reviewed' });
      expect(fraud.setStatus.mock.calls.at(-1)![2]).toMatchObject({ canSuspend: false, confirmed: false });
      // the same roles are refused by customers:setActive itself
      expect(await gw.customersSetActive(as(role), { id: 'c1', active: false })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    for (const role of ['admin', 'admin_support']) {
      await gw.fraudSetStatus(as(role), { id: 'f1', status: 'reviewed' });
      expect(fraud.setStatus.mock.calls.at(-1)![2]).toMatchObject({ canSuspend: true });
    }
    for (const role of ['admin', 'admin_support']) {
      expect(await gw.customersSetActive(as(role), { id: 'c1', active: false })).toMatchObject({ ok: true });
    }
    expect(disconnectSockets).toHaveBeenCalledTimes(2); // the two real suspensions kicked
  });

  it('roles outside the fraud group and bad statuses are refused before the service is called; no kick without a block', async () => {
    for (const role of ['admin_marketing', 'customer', 'seller', 'rider', 'warehouse_staff']) {
      expect(await gw.fraudSetStatus(as(role), { id: 'f1', status: 'blocked', confirm: true })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(await gw.fraudSetStatus(as('admin'), { id: 'f1', status: 'nonsense' as never })).toMatchObject({ ok: false });
    expect(fraud.setStatus).not.toHaveBeenCalled();
    await gw.fraudSetStatus(as('admin'), { id: 'f1', status: 'reviewed' });
    expect(disconnectSockets).not.toHaveBeenCalled();
  });

  it('Support (which can suspend accounts) sees the alerts and can block; fraud:list is the same group', async () => {
    const list = jest.fn(async () => [{ id: 'f1' }]);
    Object.assign(gw, { fraud: { ...fraud, list } });
    for (const role of ['admin', 'admin_finance', 'admin_operations', 'admin_moderation', 'admin_support']) {
      expect(await gw.fraudList(as(role))).toEqual({ ok: true, data: [{ id: 'f1' }] });
    }
    for (const role of ['admin_marketing', 'customer', 'seller', 'rider', 'warehouse_staff']) {
      expect(await gw.fraudList(as(role))).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(await gw.fraudSetStatus(as('admin_support', 'sup1'), { id: 'f1', status: 'blocked', confirm: true })).toMatchObject({ ok: true });
    expect(fraud.setStatus).toHaveBeenCalledWith('f1', 'blocked', { id: 'sup1', name: 'admin_support name', role: 'admin_support', canSuspend: true, confirmed: true });
  });

  it('a service refusal is the ack error and no socket is dropped', async () => {
    fraud.setStatus.mockRejectedValueOnce(new Error('Confirm that blocking suspends this customer\'s account.'));
    expect(await gw.fraudSetStatus(as('admin'), { id: 'f1', status: 'blocked' })).toEqual({ ok: false, error: 'Confirm that blocking suspends this customer\'s account.' });
    expect(disconnectSockets).not.toHaveBeenCalled();
  });

  it('the wallet panel is read-only and open to the same roles as the customer list', async () => {
    for (const role of ['admin', 'admin_operations', 'admin_finance', 'admin_support']) {
      expect(await gw.customersWallet(as(role), { id: 'c1', limit: 5 })).toEqual({ ok: true, data: { balance: 12.5, transactions: [] } });
    }
    expect(customers.wallet).toHaveBeenCalledWith('c1', { id: 'c1', limit: 5 });
    customers.wallet.mockClear();
    for (const role of ['admin_marketing', 'admin_moderation', 'warehouse_staff', 'rider', 'seller', 'customer']) {
      expect(await gw.customersWallet(as(role), { id: 'c1' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(customers.wallet).not.toHaveBeenCalled();
  });
});
