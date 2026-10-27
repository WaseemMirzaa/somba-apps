import { DisputesGateway } from '../disputes/disputes.gateway';
import { AfterSaleGateway } from '../flows/after-sale.gateway';
import { EngagementGateway } from '../content/engagement.gateway';
import { SupportGateway } from '../content/support.gateway';
import { NotificationsGateway } from '../notifications/notifications.gateway';

// The team-aware "my store" resolver: a seller account is the store; a 'customer' never gets here.
jest.mock('../sellers/seller-context', () => ({
  sellerContext: jest.fn(async (user: { id: string; name: string }) => ({
    actor: { id: `owner-of-${user.id}`, name: user.name, role: 'seller' },
    ownerIds: [`store-of-${user.id}`, `owner-of-${user.id}`],
  })),
}));

const client = (role: string, id = 'u1', name = 'User One') => ({ data: { user: { id, role, name } } }) as never;
const guest = { data: { user: { id: 'guest', role: 'guest', name: 'Guest' } } } as never;

const echo = () => jest.fn(async (...a: unknown[]) => ({ args: a }));

function disputes() {
  const svc = {
    list: echo(), get: echo(), eligibility: echo(), open: echo(), reply: echo(), escalate: echo(), cancel: echo(),
    sellerRespond: echo(), adminDecideReturn: echo(), decide: echo(), resolve: echo(), markReceived: echo(), grade: echo(), reject: echo(),
  };
  const audit = { record: jest.fn(async () => undefined) };
  return { svc, audit, gw: new DisputesGateway(svc as never, audit as never) };
}

describe('DisputesGateway', () => {
  it('refuses guests everywhere', async () => {
    const { gw } = disputes();
    for (const call of [gw.list(guest), gw.get(guest, { id: 'x' }), gw.open(guest, {} as never), gw.respond(guest, { accept: true })]) {
      expect(await call).toEqual({ ok: false, error: 'Sign in to continue.' });
    }
  });

  it('opening, escalating, cancelling and asking about the window are for customers', async () => {
    const { gw, svc } = disputes();
    for (const role of ['seller', 'admin', 'rider', 'warehouse_staff']) {
      expect(await gw.open(client(role), { orderId: 'o', type: 'return', reason: 'Broken on arrival' })).toEqual({ ok: false, error: 'Customers only.' });
      expect(await gw.escalate(client(role), { id: 'd' })).toEqual({ ok: false, error: 'Customers only.' });
      expect(await gw.cancel(client(role), { id: 'd' })).toEqual({ ok: false, error: 'Customers only.' });
      expect(await gw.eligibility(client(role), { orderId: 'o' })).toEqual({ ok: false, error: 'Customers only.' });
    }
    expect(svc.open).not.toHaveBeenCalled();
    const ok = await gw.open(client('customer'), { orderId: 'o', type: 'return', reason: 'Broken on arrival', items: [{ itemId: 'i', qty: 2 }], attachments: ['u'], refundTo: 'phone' });
    expect(ok.ok).toBe(true);
    expect(svc.open).toHaveBeenCalledWith({ id: 'u1', name: 'User One' }, expect.objectContaining({ orderId: 'o', items: [{ itemId: 'i', qty: 2 }], attachments: ['u'], refundTo: 'phone' }));
  });

  it('answering a return is for sellers, acting as the store', async () => {
    const { gw, svc } = disputes();
    expect(await gw.respond(client('customer'), { id: 'd', accept: true })).toEqual({ ok: false, error: 'Sellers only.' });
    expect(await gw.respond(client('admin'), { id: 'd', accept: true })).toEqual({ ok: false, error: 'Sellers only.' });
    await gw.respond(client('seller', 'staff-1', 'Staff Member'), { disputeId: 'd', accept: true, reason: 'ok' });
    expect(svc.sellerRespond).toHaveBeenCalledWith(expect.objectContaining({ id: 'owner-of-staff-1', role: 'seller' }), 'd', true, 'ok');
    await gw.respond(client('seller'), { id: 'd', accept: 'yes' as never });
    expect(svc.sellerRespond).toHaveBeenLastCalledWith(expect.anything(), 'd', false, undefined); // only a real true accepts
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

  it('the warehouse desk: receive and grade for warehouse staff and admins only', async () => {
    const { gw, svc } = disputes();
    for (const role of ['customer', 'seller', 'rider']) {
      expect(await gw.markReceived(client(role), { disputeId: 'd' })).toEqual({ ok: false, error: 'Ops only.' });
      expect(await gw.grade(client(role), { id: 'd', grades: [] })).toEqual({ ok: false, error: 'Ops only.' });
    }
    await gw.markReceived(client('warehouse_staff'), { disputeId: 'd', restock: false });
    expect(svc.markReceived).toHaveBeenCalledWith('d', false);
    await gw.markReceived(client('admin_support'), { disputeId: 'd' });
    expect(svc.markReceived).toHaveBeenLastCalledWith('d', true);
    await gw.grade(client('warehouse_staff'), { id: 'd', grades: [{ itemId: 'i', condition: 'resellable' }], note: 'fine' });
    expect(svc.grade).toHaveBeenCalledWith(expect.objectContaining({ role: 'warehouse_staff' }), 'd', [{ itemId: 'i', condition: 'resellable' }], 'fine');
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
    return { rep, exc, gw: new AfterSaleGateway(rep as never, exc as never) };
  }

  it('the desk steps are ops only; a bad status is refused before it reaches the service', async () => {
    const { gw, rep, exc } = make();
    for (const role of ['customer', 'seller', 'rider']) {
      expect(await gw.replacementsSetStatus(client(role), { id: 'r', status: 'approved' })).toEqual({ ok: false, error: 'Ops only.' });
      expect(await gw.exchangesSetStatus(client(role), { id: 'e', status: 'approved' })).toEqual({ ok: false, error: 'Ops only.' });
    }
    expect((await gw.replacementsSetStatus(client('warehouse_staff'), { id: 'r', status: 'nonsense' as never })).ok).toBe(false);
    expect((await gw.replacementsSetStatus(client('warehouse_staff'), { id: 'r', status: 'delivered' })).ok).toBe(true);
    expect((await gw.exchangesSetStatus(client('admin'), { id: 'e', status: 'ready' })).ok).toBe(true);
    expect(rep.setStatus).toHaveBeenCalledTimes(1);
    expect(exc.setStatus).toHaveBeenCalledTimes(1);
  });

  it('respond: sellers (as their store) and admins; customers, riders and the warehouse cannot', async () => {
    const { gw, rep, exc } = make();
    for (const role of ['customer', 'rider', 'warehouse_staff']) {
      expect(await gw.replacementsRespond(client(role), { id: 'r', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.exchangesRespond(client(role), { id: 'e', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    await gw.replacementsRespond(client('seller', 's9'), { id: 'r', approve: true, reason: 'x' });
    expect(rep.respond).toHaveBeenCalledWith(expect.objectContaining({ id: 'owner-of-s9' }), 'r', true, 'x');
    await gw.exchangesRespond(client('admin_support'), { id: 'e', approve: false, reason: 'no thanks' });
    expect(exc.respond).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin_support' }), 'e', false, 'no thanks');
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

  it('answering a question: admins; a seller only for their own product; nobody else', async () => {
    const { gw, reviews } = make();
    expect(await gw.answer(client('customer'), { id: 'q', answer: 'Sure' })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.answer(client('seller', 's2'), { id: 'q', answer: 'Not mine' })).toEqual({ ok: false, error: 'Not allowed.' }); // owner is store-of-s1
    expect(await gw.answer(client('seller', 's1'), { id: 'q', answer: '   ' })).toEqual({ ok: false, error: 'Write an answer first.' });
    expect((await gw.answer(client('seller', 's1', 'Shop'), { id: 'q', answer: ' Yes. ' })).ok).toBe(true);
    expect(reviews.answer).toHaveBeenCalledWith('q', 'Yes.', 'Shop');
    expect((await gw.answer(client('admin_support'), { id: 'q', answer: 'Yes.' })).ok).toBe(true);
  });

  it('helpful votes need an account', async () => {
    const { gw } = make();
    expect(await gw.helpful(guest, { id: 'r' })).toEqual({ ok: false, error: 'Sign in to continue.' });
  });
});

describe('SupportGateway and NotificationsGateway', () => {
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
