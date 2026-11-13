import { DisputesGateway } from '../disputes/disputes.gateway';
import { AfterSaleGateway } from '../flows/after-sale.gateway';
import { EngagementGateway } from '../content/engagement.gateway';
import { SupportGateway } from '../content/support.gateway';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { StaffTierService } from '../logistics/staff-tier.service';

// The team-aware "my store" resolver: a seller account is the store (the after-sale gateways no longer use it: sellers take no part).
jest.mock('../sellers/seller-context', () => ({
  sellerContext: jest.fn(async (user: { id: string; name: string }) => ({
    actor: { id: `owner-of-${user.id}`, name: user.name, role: 'seller' },
    ownerIds: [`store-of-${user.id}`, `owner-of-${user.id}`],
  })),
}));

const client = (role: string, id = 'u1', name = 'User One') => ({ data: { user: { id, role, name } } }) as never;
const guest = { data: { user: { id: 'guest', role: 'guest', name: 'Guest' } } } as never;

/** Warehouse staff by user id: the tier a person holds in the database (no entry = no tier set = operator). */
const STAFF_TIER: Record<string, string> = { 'op-1': 'operator', 'sup-1': 'supervisor', 'mgr-1': 'manager' };
const tiers = () => new StaffTierService({ findOne: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, warehouseTier: STAFF_TIER[where.id] ?? null, hubId: `hub-of-${where.id}` })) } as never);
const SUP = 'Only supervisors and managers can do this.';

const echo = () => jest.fn(async (...a: unknown[]) => ({ args: a }));

/** The seller view with nothing switched on: a store account reads only its own purchases (§13 covers the switched-on case). */
function noStoreView() {
  return { readerOf: jest.fn(async () => null) } as never;
}

function disputes() {
  const svc = {
    list: echo(), get: echo(), eligibility: echo(), open: echo(), reply: echo(), cancel: echo(),
    adminDecideReturn: echo(), decide: echo(), resolve: echo(), markReceived: echo(), grade: echo(), reject: echo(),
  };
  const audit = { record: jest.fn(async () => undefined) };
  return { svc, audit, gw: new DisputesGateway(svc as never, audit as never, tiers(), noStoreView()) };
}

describe('DisputesGateway', () => {
  it('refuses guests everywhere', async () => {
    const { gw } = disputes();
    for (const call of [gw.list(guest), gw.get(guest, { id: 'x' }), gw.open(guest, {} as never), gw.respond(guest)]) {
      expect(await call).toEqual({ ok: false, error: 'Sign in to continue.' });
    }
  });

  it('opening, cancelling and asking about the window are for customers', async () => {
    const { gw, svc } = disputes();
    for (const role of ['seller', 'admin', 'rider', 'warehouse_staff']) {
      expect(await gw.open(client(role), { orderId: 'o', type: 'return', reason: 'Broken on arrival' })).toEqual({ ok: false, error: 'Customers only.' });
      expect(await gw.cancel(client(role), { id: 'd' })).toEqual({ ok: false, error: 'Customers only.' });
      expect(await gw.eligibility(client(role), { orderId: 'o' })).toEqual({ ok: false, error: 'Customers only.' });
    }
    expect(svc.open).not.toHaveBeenCalled();
    const ok = await gw.open(client('customer'), { orderId: 'o', type: 'return', reason: 'Broken on arrival', items: [{ itemId: 'i', qty: 2 }], attachments: ['u'], refundTo: 'phone' });
    expect(ok.ok).toBe(true);
    expect(svc.open).toHaveBeenCalledWith({ id: 'u1', name: 'User One' }, expect.objectContaining({ orderId: 'o', items: [{ itemId: 'i', qty: 2 }], attachments: ['u'], refundTo: 'phone' }));
  });

  it('the seller\'s part is gone: returns:respond and disputes:escalate answer with a message for every role and call nothing', async () => {
    const { gw, svc } = disputes();
    for (const role of ['customer', 'seller', 'admin', 'admin_support']) {
      expect(await gw.respond(client(role))).toEqual({ ok: false, error: 'Returns are decided by KOMORIKO support.' });
      expect(await gw.escalate(client(role))).toEqual({ ok: false, error: 'Your request is already with KOMORIKO support.' });
    }
    expect(svc.adminDecideReturn).not.toHaveBeenCalled();
    expect(await gw.respond(guest)).toEqual({ ok: false, error: 'Sign in to continue.' });
  });

  it('a seller reads and writes nothing of a store\'s cases: they act as themselves (a seller who shops sees their own purchases)', async () => {
    const { gw, svc } = disputes();
    await gw.list(client('seller', 's1'), {});
    expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1', role: 'seller' }), {});
    await gw.reply(client('seller', 's1'), { id: 'd', message: 'hi' });
    expect(svc.reply).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1', role: 'seller' }), 'd', 'hi', undefined);
  });

  it('deciding: admin, support, operations and finance; nobody else. Refunds only for admin and finance', async () => {
    const { gw, svc, audit } = disputes();
    for (const role of ['customer', 'seller', 'warehouse_staff', 'rider', 'admin_marketing', 'admin_moderation']) {
      expect(await gw.decide(client(role), { id: 'd', outcome: 'reject' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.decideReturn(client(role), { id: 'd', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(svc.decide).not.toHaveBeenCalled();
    const canRefund: Record<string, boolean> = { admin: true, admin_finance: true, admin_support: false, admin_operations: false };
    for (const [role, expected] of Object.entries(canRefund)) {
      await gw.decide(client(role), { id: 'd', outcome: 'refund_partial', amountUsd: 5 });
      expect(svc.decide).toHaveBeenLastCalledWith(expect.objectContaining({ role }), 'd', expect.objectContaining({ outcome: 'refund_partial', amountUsd: 5 }), expected);
    }
    expect(audit.record).toHaveBeenCalledTimes(4);
  });

  it('the warehouse desk: receive and grade for warehouse supervisors and above, the Super Admin and Operations only', async () => {
    const { gw, svc } = disputes();
    for (const role of ['customer', 'seller', 'rider']) {
      expect(await gw.markReceived(client(role), { disputeId: 'd' })).toEqual({ ok: false, error: 'Ops only.' });
      expect(await gw.grade(client(role), { id: 'd', grades: [] })).toEqual({ ok: false, error: 'Ops only.' });
    }
    await gw.markReceived(client('warehouse_staff', 'sup-1'), { disputeId: 'd', restock: false });
    // The service gets the caller with their warehouse, so it can refuse another warehouse's return.
    expect(svc.markReceived).toHaveBeenCalledWith('d', false, expect.objectContaining({ id: 'sup-1', role: 'warehouse_staff', hubId: 'hub-of-sup-1' }));
    await gw.markReceived(client('admin_operations'), { disputeId: 'd' });
    expect(svc.markReceived).toHaveBeenLastCalledWith('d', true, expect.objectContaining({ role: 'admin_operations' }));
    await gw.grade(client('warehouse_staff', 'mgr-1'), { id: 'd', grades: [{ itemId: 'i', condition: 'resellable' }], note: 'fine' });
    expect(svc.grade).toHaveBeenCalledWith(expect.objectContaining({ role: 'warehouse_staff', hubId: 'hub-of-mgr-1' }), 'd', [{ itemId: 'i', condition: 'resellable' }], 'fine');
  });

  it('every other admin role is refused at the returns desk, and nothing is written or audited', async () => {
    const { gw, svc, audit } = disputes();
    for (const role of ['admin_support', 'admin_finance', 'admin_marketing', 'admin_moderation']) {
      expect(await gw.markReceived(client(role), { disputeId: 'd' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.grade(client(role), { id: 'd', grades: [{ itemId: 'i', condition: 'resellable' }] })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(svc.markReceived).not.toHaveBeenCalled();
    expect(svc.grade).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations']) {
      expect((await gw.markReceived(client(role), { disputeId: 'd' })).ok).toBe(true);
      expect((await gw.grade(client(role), { id: 'd', grades: [] })).ok).toBe(true);
    }
    expect(audit.record).toHaveBeenCalledTimes(4);
  });

  it('warehouse staff read returns through their own warehouse: the list and the detail carry their hub; other roles are unchanged', async () => {
    const { gw, svc } = disputes();
    await gw.list(client('warehouse_staff', 'op-1'), { status: 'open' });
    expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'op-1', role: 'warehouse_staff', hubId: 'hub-of-op-1' }), { status: 'open' });
    await gw.returnsList(client('warehouse_staff', 'sup-1'), {});
    expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ hubId: 'hub-of-sup-1' }), { type: 'return' });
    await gw.get(client('warehouse_staff', 'mgr-1'), { id: 'd' });
    expect(svc.get).toHaveBeenLastCalledWith(expect.objectContaining({ hubId: 'hub-of-mgr-1' }), 'd');
    await gw.list(client('admin_support'), {});
    expect(svc.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ hubId: expect.anything() }), {});
  });

  it('the returns queue is a supervisor page: an operator (or staff with no tier set) can neither receive nor grade; supervisors, managers and admins can', async () => {
    const { gw, svc } = disputes();
    for (const id of ['op-1', 'no-tier']) {
      expect(await gw.markReceived(client('warehouse_staff', id), { disputeId: 'd' })).toEqual({ ok: false, error: SUP });
      expect(await gw.grade(client('warehouse_staff', id), { id: 'd', grades: [] })).toEqual({ ok: false, error: SUP });
    }
    expect(svc.markReceived).not.toHaveBeenCalled();
    expect(svc.grade).not.toHaveBeenCalled();
    for (const [role, id] of [['warehouse_staff', 'sup-1'], ['warehouse_staff', 'mgr-1'], ['admin', 'a1']] as const) {
      expect((await gw.markReceived(client(role, id), { disputeId: 'd' })).ok).toBe(true);
      expect((await gw.grade(client(role, id), { id: 'd', grades: [] })).ok).toBe(true);
    }
  });

  it('the old admin buttons: resolve with a refund needs admin or finance; force only for the super admin; reject for admins', async () => {
    const { gw, svc } = disputes();
    expect(await gw.resolve(client('seller'), { disputeId: 'd' })).toEqual({ ok: false, error: 'Admins only.' });
    expect(await gw.reject(client('customer'), { disputeId: 'd' })).toEqual({ ok: false, error: 'Admins only.' });
    await gw.resolve(client('admin_finance'), { disputeId: 'd', refund: true, force: true });
    expect(svc.resolve).toHaveBeenLastCalledWith('d', { resolution: undefined, refund: true, force: false }, true);
    await gw.resolve(client('admin'), { disputeId: 'd', refund: true, force: true });
    expect(svc.resolve).toHaveBeenLastCalledWith('d', { resolution: undefined, refund: true, force: true }, true);
    await gw.resolve(client('admin_support'), { disputeId: 'd' });
    expect(svc.resolve).toHaveBeenLastCalledWith('d', expect.anything(), false);
  });

  it('the queue and a case’s thread are for the returns and disputes desk (super admin, operations, support, finance); marketing and moderation are refused and nothing is read', async () => {
    const { gw, svc } = disputes();
    for (const role of ['admin_marketing', 'admin_moderation']) {
      expect(await gw.list(client(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.returnsList(client(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.get(client(role), { id: 'd' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.reply(client(role), { id: 'd', message: 'hi' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(svc.list).not.toHaveBeenCalled();
    expect(svc.get).not.toHaveBeenCalled();
    expect(svc.reply).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations', 'admin_support', 'admin_finance']) {
      expect((await gw.list(client(role), {})).ok).toBe(true);
      expect((await gw.get(client(role), { id: 'd' })).ok).toBe(true);
      expect((await gw.reply(client(role), { id: 'd', message: 'hi' })).ok).toBe(true);
    }
    // customers and sellers still read their own through the service
    expect((await gw.list(client('customer'), {})).ok).toBe(true);
    expect((await gw.list(client('seller'), {})).ok).toBe(true);
  });

  it('the old resolve and reject buttons keep "Admins only." for non-admins and refuse marketing and moderation with "Not allowed."', async () => {
    const { gw, svc, audit } = disputes();
    for (const role of ['admin_marketing', 'admin_moderation']) {
      expect(await gw.resolve(client(role), { disputeId: 'd', refund: true })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.reject(client(role), { disputeId: 'd' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(svc.resolve).not.toHaveBeenCalled();
    expect(svc.reject).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations', 'admin_support', 'admin_finance']) {
      expect((await gw.resolve(client(role), { disputeId: 'd' })).ok).toBe(true);
      expect((await gw.reject(client(role), { disputeId: 'd' })).ok).toBe(true);
    }
  });

  it('turns a service error into the ack', async () => {
    const { gw, svc } = disputes();
    svc.get.mockRejectedValueOnce(new Error('Dispute not found.'));
    expect(await gw.get(client('customer'), { id: 'x' })).toEqual({ ok: false, error: 'Dispute not found.' });
  });
});

describe('AfterSaleGateway', () => {
  function make() {
    const rep = { list: echo(), get: echo(), mine: echo(), create: echo(), respond: echo(), setStatus: echo() };
    const exc = { list: echo(), get: echo(), mine: echo(), create: echo(), respond: echo(), setStatus: echo() };
    const audit = { record: jest.fn(async (_entry: { action: string; role: string; entity: string; entityId?: string; detail?: string }) => undefined) };
    return { rep, exc, audit, gw: new AfterSaleGateway(rep as never, exc as never, tiers(), audit as never, noStoreView()) };
  }

  it('A-03: an exchange is moved (and so credited on delivery) by the exchange desk and warehouse supervisors only', async () => {
    const { gw, exc } = make();
    for (const role of ['admin_marketing', 'admin_moderation', 'admin_support', 'admin_finance']) {
      expect(await gw.exchangesSetStatus(client(role), { id: 'e', status: 'delivered' })).toEqual({ ok: false, error: 'Ops only.' });
    }
    expect(exc.setStatus).not.toHaveBeenCalled();
    for (const [role, id] of [['admin', 'a1'], ['admin_operations', 'a2'], ['warehouse_staff', 'sup-1']] as const) {
      expect((await gw.exchangesSetStatus(client(role, id), { id: 'e', status: 'delivered' })).ok).toBe(true);
    }
    // The service gets the caller, so it can refuse too.
    expect(exc.setStatus).toHaveBeenLastCalledWith('e', 'delivered', expect.objectContaining({ role: 'warehouse_staff', id: 'sup-1' }));
  });

  it('A-03: an exchange is decided by the desk and support only; sellers, marketing, moderation and finance are refused', async () => {
    const { gw, exc } = make();
    for (const role of ['seller', 'admin_marketing', 'admin_moderation', 'admin_finance']) {
      expect(await gw.exchangesRespond(client(role), { id: 'e', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(exc.respond).not.toHaveBeenCalled();
  });

  it('A-03: staff actions on an exchange are audited, with any wallet credit; a customer’s own are not', async () => {
    const { gw, exc, audit } = make();
    exc.create.mockResolvedValueOnce({ id: 'e1', reference: 'EXC-1', orderReference: 'SOM-1', priceDiffUsd: 0, status: 'requested' } as never);
    await gw.exchangesCreate(client('customer', 'c1'), { orderId: 'o', toSku: 'x', toName: 'X' });
    expect(audit.record).not.toHaveBeenCalled();
    exc.create.mockResolvedValueOnce({ id: 'e1', reference: 'EXC-1', orderReference: 'SOM-1', priceDiffUsd: 0, status: 'requested' } as never);
    await gw.exchangesCreate(client('admin_operations', 'a2'), { orderId: 'o', toSku: 'x', toName: 'X' });
    exc.respond.mockResolvedValueOnce({ id: 'e1', reference: 'EXC-1', orderReference: 'SOM-1', priceDiffUsd: -40, status: 'approved' } as never);
    await gw.exchangesRespond(client('admin_operations', 'a2'), { id: 'e1', approve: true });
    exc.setStatus.mockResolvedValueOnce({ id: 'e1', reference: 'EXC-1', orderReference: 'SOM-1', priceDiffUsd: -40, status: 'delivered' } as never);
    await gw.exchangesSetStatus(client('admin', 'a1'), { id: 'e1', status: 'delivered' });
    expect(audit.record.mock.calls.map(([e]) => `${e.action}|${e.role}|${e.entity}|${e.entityId}`)).toEqual([
      'exchange.create|admin_operations|exchange|e1',
      'exchange.approved|admin_operations|exchange|e1',
      'exchange.delivered|admin|exchange|e1',
    ]);
    expect(audit.record.mock.calls[2][0].detail).toContain('$40.00 refunded to the customer');
  });

  it('the desk steps are ops only; a bad status is refused before it reaches the service', async () => {
    const { gw, rep, exc } = make();
    for (const role of ['customer', 'seller', 'rider']) {
      expect(await gw.replacementsSetStatus(client(role), { id: 'r', status: 'approved' })).toEqual({ ok: false, error: 'Ops only.' });
      expect(await gw.exchangesSetStatus(client(role), { id: 'e', status: 'approved' })).toEqual({ ok: false, error: 'Ops only.' });
    }
    expect((await gw.replacementsSetStatus(client('warehouse_staff', 'sup-1'), { id: 'r', status: 'nonsense' as never })).ok).toBe(false);
    expect((await gw.replacementsSetStatus(client('warehouse_staff', 'sup-1'), { id: 'r', status: 'delivered' })).ok).toBe(true);
    expect((await gw.exchangesSetStatus(client('admin'), { id: 'e', status: 'ready' })).ok).toBe(true);
    expect(rep.setStatus).toHaveBeenCalledTimes(1);
    expect(exc.setStatus).toHaveBeenCalledTimes(1);
  });

  it('replacements and exchanges are supervisor pages: an operator is refused the list, the detail and the status; supervisors, managers and admins are not; customers and sellers keep their own views', async () => {
    const { gw, rep, exc } = make();
    for (const id of ['op-1', 'no-tier']) {
      const op = client('warehouse_staff', id);
      expect(await gw.replacementsList(op, {})).toEqual({ ok: false, error: 'Only supervisors and managers can see this.' });
      expect(await gw.replacementsGet(op, { id: 'r' })).toEqual({ ok: false, error: 'Only supervisors and managers can see this.' });
      expect(await gw.exchangesList(op, {})).toEqual({ ok: false, error: 'Only supervisors and managers can see this.' });
      expect(await gw.exchangesGet(op, { id: 'e' })).toEqual({ ok: false, error: 'Only supervisors and managers can see this.' });
      expect(await gw.replacementsSetStatus(op, { id: 'r', status: 'approved' })).toEqual({ ok: false, error: SUP });
      expect(await gw.exchangesSetStatus(op, { id: 'e', status: 'approved' })).toEqual({ ok: false, error: SUP });
    }
    for (const fn of [rep.list, rep.get, rep.setStatus, exc.list, exc.get, exc.setStatus]) expect(fn).not.toHaveBeenCalled();
    for (const [role, id] of [['warehouse_staff', 'sup-1'], ['warehouse_staff', 'mgr-1'], ['admin', 'a1'], ['admin_operations', 'a2'], ['customer', 'c1'], ['seller', 's1']] as const) {
      expect((await gw.replacementsList(client(role, id), {})).ok).toBe(true);
      expect((await gw.exchangesList(client(role, id), {})).ok).toBe(true);
    }
    expect((await gw.replacementsSetStatus(client('warehouse_staff', 'mgr-1'), { id: 'r', status: 'approved' })).ok).toBe(true);
    expect((await gw.exchangesSetStatus(client('warehouse_staff', 'sup-1'), { id: 'e', status: 'approved' })).ok).toBe(true);
  });

  it('respond: support, operations and the super admin; sellers, customers, riders and the warehouse cannot', async () => {
    const { gw, rep, exc } = make();
    for (const role of ['seller', 'customer', 'rider', 'warehouse_staff']) {
      expect(await gw.replacementsRespond(client(role), { id: 'r', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.exchangesRespond(client(role), { id: 'e', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(rep.respond).not.toHaveBeenCalled();
    await gw.replacementsRespond(client('admin_support', 's9'), { id: 'r', approve: true, reason: 'x' });
    expect(rep.respond).toHaveBeenCalledWith(expect.objectContaining({ id: 's9', role: 'admin_support' }), 'r', true, 'x');
    await gw.exchangesRespond(client('admin_support'), { id: 'e', approve: false, reason: 'no thanks' });
    expect(exc.respond).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin_support' }), 'e', false, 'no thanks');
  });

  it('replacements and exchanges are read by the admin roles that decide them (super admin, operations, support); marketing, finance and moderation are refused and nothing is read', async () => {
    const { gw, rep, exc } = make();
    for (const role of ['admin_marketing', 'admin_finance', 'admin_moderation']) {
      expect(await gw.replacementsList(client(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.replacementsGet(client(role), { id: 'r' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.exchangesList(client(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.exchangesGet(client(role), { id: 'e' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    for (const fn of [rep.list, rep.get, exc.list, exc.get]) expect(fn).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations', 'admin_support']) {
      expect((await gw.replacementsList(client(role), {})).ok).toBe(true);
      expect((await gw.replacementsGet(client(role), { id: 'r' })).ok).toBe(true);
      expect((await gw.exchangesList(client(role), {})).ok).toBe(true);
      expect((await gw.exchangesGet(client(role), { id: 'e' })).ok).toBe(true);
    }
  });

  it('a replacement is moved by the exchange desk and warehouse supervisors only; support, finance, marketing and moderation are refused', async () => {
    const { gw, rep } = make();
    for (const role of ['admin_support', 'admin_finance', 'admin_marketing', 'admin_moderation']) {
      expect(await gw.replacementsSetStatus(client(role), { id: 'r', status: 'approved' })).toEqual({ ok: false, error: 'Ops only.' });
    }
    expect(rep.setStatus).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations']) expect((await gw.replacementsSetStatus(client(role), { id: 'r', status: 'approved' })).ok).toBe(true);
    expect(rep.setStatus).toHaveBeenCalledTimes(2);
  });

  it('a replacement is decided by the desk and support only; sellers, marketing, moderation and finance are refused', async () => {
    const { gw, rep } = make();
    for (const role of ['seller', 'admin_marketing', 'admin_moderation', 'admin_finance']) {
      expect(await gw.replacementsRespond(client(role), { id: 'r', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(rep.respond).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations', 'admin_support']) expect((await gw.replacementsRespond(client(role), { id: 'r', approve: true })).ok).toBe(true);
    expect(rep.respond).toHaveBeenCalledTimes(3);
  });

  it('mine is always the caller’s own, whatever their role', async () => {
    const { gw, rep, exc } = make();
    await gw.replacementsMine(client('seller', 'sx'), {});
    await gw.exchangesMine(client('customer', 'cx'), { status: 'approved' });
    expect(rep.mine).toHaveBeenCalledWith('sx', {});
    expect(exc.mine).toHaveBeenCalledWith('cx', { status: 'approved' });
  });
});

describe('EngagementGateway', () => {
  function make() {
    const reviews = {
      listForProduct: echo(), listForSeller: echo(), reply: echo(), report: echo(), listReports: echo(), setStatus: echo(),
      listForModeration: echo(), create: echo(), markHelpful: echo(), listQuestions: echo(), ask: echo(),
      listQuestionsForSeller: echo(), countUnanswered: echo(), answer: echo(), productIdOfQuestion: jest.fn(async () => 'p1'), productSellerId: jest.fn(async () => 'store-of-s1'),
    };
    const audit = { record: jest.fn(async () => undefined) };
    return { reviews, audit, gw: new EngagementGateway(reviews as never, audit as never) };
  }

  it('hidden reviews are listed only to moderators', async () => {
    const { gw, reviews } = make();
    await gw.list(client('seller'), { productId: 'p', includeHidden: true });
    expect(reviews.listForProduct).toHaveBeenLastCalledWith('p', false);
    await gw.list(client('admin_moderation'), { productId: 'p', includeHidden: true });
    expect(reviews.listForProduct).toHaveBeenLastCalledWith('p', true);
    await gw.list(guest, { productId: 'p' });
    expect(reviews.listForProduct).toHaveBeenLastCalledWith('p', false);
  });

  it('moderation (hide/restore, queue, reports) is for admin, operations and moderation only; the reason travels and is audited', async () => {
    const { gw, reviews, audit } = make();
    for (const role of ['customer', 'seller', 'admin_support', 'admin_finance', 'admin_marketing']) {
      expect(await gw.setStatus(client(role), { reviewId: 'r', status: 'hidden' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.admin(client(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.reports(client(role), { id: 'r' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect((await gw.setStatus(client('admin_moderation'), { reviewId: 'r', status: 'banana' as never })).ok).toBe(false);
    reviews.setStatus.mockResolvedValueOnce({ id: 'r' } as never);
    await gw.setStatus(client('admin_moderation'), { reviewId: 'r', status: 'hidden', reason: 'Insults' });
    expect(reviews.setStatus).toHaveBeenCalledWith('r', 'hidden', 'Insults');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'review.hidden', detail: 'Insults' }));
  });

  it('reporting a review and the Q&A inbox are for sellers, acting as the store', async () => {
    const { gw, reviews } = make();
    expect(await gw.report(client('customer'), { id: 'r', reason: 'Not a seller at all' })).toEqual({ ok: false, error: 'Sellers only.' });
    expect(await gw.sellerInbox(client('customer'), {})).toEqual({ ok: false, error: 'Sellers only.' });
    expect(await gw.unanswered(client('admin'))).toEqual({ ok: false, error: 'Sellers only.' });
    await gw.report(client('seller', 's1', 'Staff'), { id: 'r', reason: 'Abusive language here' });
    expect(reviews.report).toHaveBeenCalledWith(expect.objectContaining({ id: 'owner-of-s1', name: 'Staff' }), 'r', 'Abusive language here');
    await gw.sellerInbox(client('seller', 's1'), { status: 'unanswered' });
    expect(reviews.listQuestionsForSeller).toHaveBeenCalledWith(['store-of-s1', 'owner-of-s1'], { status: 'unanswered' });
  });

  it('answering a question: the moderators (super admin, operations, moderation); a seller only for their own product; nobody else', async () => {
    const { gw, reviews } = make();
    expect(await gw.answer(client('customer'), { id: 'q', answer: 'Sure' })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.answer(client('seller', 's2'), { id: 'q', answer: 'Not mine' })).toEqual({ ok: false, error: 'Not allowed.' }); // owner is store-of-s1
    expect(await gw.answer(client('seller', 's1'), { id: 'q', answer: '   ' })).toEqual({ ok: false, error: 'Write an answer first.' });
    expect((await gw.answer(client('seller', 's1', 'Shop'), { id: 'q', answer: ' Yes. ' })).ok).toBe(true);
    expect(reviews.answer).toHaveBeenCalledWith('q', 'Yes.', 'Shop');
    // Staff answer on any product only when they moderate it: the super admin, operations and moderation. Support, finance and marketing do not.
    for (const role of ['admin', 'admin_operations', 'admin_moderation']) expect((await gw.answer(client(role), { id: 'q', answer: 'Yes.' })).ok).toBe(true);
    for (const role of ['admin_support', 'admin_finance', 'admin_marketing']) {
      expect(await gw.answer(client(role), { id: 'q', answer: 'Yes.' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(reviews.answer).toHaveBeenCalledTimes(4); // the seller's, then the three moderators
  });

  it('helpful votes need an account', async () => {
    const { gw } = make();
    expect(await gw.helpful(guest, { id: 'r' })).toEqual({ ok: false, error: 'Sign in to continue.' });
  });
});

describe('SupportGateway and NotificationsGateway', () => {
  it('support agents are the Super Admin and the Support department: other admin roles cannot change a status or assign', async () => {
    const svc = { list: echo(), get: echo(), open: echo(), reply: echo(), setStatus: echo(), markRead: echo(), assign: echo() };
    const gw = new SupportGateway(svc as never);
    for (const role of ['admin_finance', 'admin_operations', 'admin_marketing', 'admin_moderation', 'warehouse_staff', 'seller', 'customer', 'rider']) {
      expect(await gw.setStatus(client(role), { id: 't', status: 'closed' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.assign(client(role), { id: 't', assigneeId: 'a' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(svc.setStatus).not.toHaveBeenCalled();
    expect(svc.assign).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_support']) {
      expect((await gw.setStatus(client(role), { id: 't', status: 'closed' })).ok).toBe(true);
      expect((await gw.assign(client(role), { id: 't', assigneeId: 'a' })).ok).toBe(true);
    }
  });

  it('support: only admins change status, mark-assign; anyone signed in opens, replies and reads', async () => {
    const svc = { list: echo(), get: echo(), open: echo(), reply: echo(), setStatus: echo(), markRead: echo(), assign: echo() };
    const gw = new SupportGateway(svc as never);
    expect(await gw.setStatus(client('customer'), { id: 't', status: 'closed' })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.assign(client('rider'), { id: 't', assigneeId: 'a' })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.open(guest, { subject: 's', message: 'm' })).toEqual({ ok: false, error: 'Sign in to continue.' });
    await gw.open(client('rider', 'r1', 'Jean'), { subject: 'App crash', message: 'It closes', category: 'technical', orderId: 'o', attachments: ['u'] });
    expect(svc.open).toHaveBeenCalledWith({ id: 'r1', name: 'Jean', role: 'rider' }, expect.objectContaining({ category: 'technical', orderId: 'o', attachments: ['u'] }));
    await gw.reply(client('customer'), { id: 't', text: 'hello', attachments: ['u'] });
    expect(svc.reply).toHaveBeenCalledWith('t', expect.objectContaining({ role: 'customer' }), 'hello', ['u']);
    await gw.assign(client('admin_support'), { id: 't', assigneeId: '' });
    expect(svc.assign).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin_support' }), 't', null);
  });

  it('the bell passes the reader’s role so role-wide notices read per person', async () => {
    const n = { listForUser: echo(), markRead: jest.fn(async () => undefined), markAllRead: jest.fn(async () => 2) };
    const gw = new NotificationsGateway(n as never);
    await gw.list(client('admin', 'sa'));
    expect(n.listForUser).toHaveBeenCalledWith('sa', 'admin');
    await gw.markRead(client('admin_support', 'ag'), { id: 'n1' });
    expect(n.markRead).toHaveBeenCalledWith('n1', 'ag', 'admin_support');
    expect(await gw.markAllRead(client('admin_support', 'ag'))).toEqual({ ok: true, data: { count: 2 } });
    expect(n.markAllRead).toHaveBeenCalledWith('ag', 'admin_support');
    expect(await gw.list(guest)).toEqual({ ok: false, error: 'Sign in to continue.' });
  });
});
