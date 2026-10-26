import { DataSource } from 'typeorm';
import { DeliveryTask, Order, OrderItem, SellerTeamMember, SupportMessage, SupportTicket, User } from '../database/entities';
import { addProduct, addSeller, recordingEmitter, testDb } from '../testing/test-db';
import { SupportService } from './support.service';

const UP = 'http://x/uploads/00000000-0000-4000-8000-000000000001.png';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; title: string; body: string; type?: string; entityId?: string }[];
let svc: SupportService;
let order: Order;

const customer = { id: 'c1', name: 'Marie', role: 'customer' };
const seller = { id: 's1', name: 'Shop', role: 'seller' };
const rider = { id: 'r1', name: 'Jean', role: 'rider' };
const agent = { id: 'a1', name: 'Agent', role: 'admin_support' };
const agent2 = { id: 'a2', name: 'Agent Two', role: 'admin_support' };

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  for (const [id, role, name] of [['a1', 'admin_support', 'Agent'], ['a2', 'admin_support', 'Agent Two'], ['c1', 'customer', 'Marie']] as const) {
    await ds.getRepository(User).save(ds.getRepository(User).create({ id, emailHash: id, email: `${id}@x.y`, passwordHash: 'x', name, role }));
  }
  order = await ds.getRepository(Order).save(ds.getRepository(Order).create({ reference: 'SOM-1', customerId: 'c1', customerName: 'Marie', status: 'delivered', totalUsd: 10 }));
  const notifications = {
    toUser: async (to: string, n: { title: string; body: string }) => void notices.push({ to, ...n }),
    toRole: async (to: string, n: { title: string; body: string }) => void notices.push({ to: `role:${to}`, ...n }),
    toAdmins: async (n: { title: string; body: string }) => void notices.push({ to: 'role:admins', ...n }),
  };
  svc = new SupportService(ds.getRepository(SupportTicket), ds.getRepository(SupportMessage), ds.getRepository(Order), ds.getRepository(User), notifications as never, emitter as never);
});
afterEach(async () => ds.destroy());

const titles = (to: string) => notices.filter((n) => n.to === to).map((n) => n.title);
const thread = (t: SupportTicket) => JSON.parse(t.messages) as { from: string; role: string; text: string; attachments: string[] }[];

describe('opening a ticket', () => {
  it('stamps the real role, links an order, keeps the category and the photo, and counts 1 unread for the agents', async () => {
    const t = await svc.open(customer, { subject: 'Slow charger', category: 'order', message: 'It takes 8 hours', orderId: order.id, attachments: [UP] });
    expect(t).toMatchObject({ role: 'customer', orderId: order.id, category: 'order', status: 'open', staffUnread: 1, userUnread: 0 });
    expect(thread(t)).toEqual([expect.objectContaining({ role: 'customer', text: 'It takes 8 hours', attachments: [UP] })]);
  });

  it('works for a seller and a rider, each stamped with their own role', async () => {
    await ownLine(seller.id);
    const a = await svc.open(seller, { subject: 'Payout', category: 'payment', message: 'When is my payout?', orderId: order.id });
    const b = await svc.open(rider, { subject: 'App crash', category: 'technical', message: 'The app closes on a task' });
    expect([a.role, b.role]).toEqual(['seller', 'rider']);
    expect(thread(b)[0].role).toBe('rider');
  });

  /** A store owned by `userId` with one line on the shared order. */
  async function ownLine(userId: string) {
    const store = await addSeller(ds, { userId, name: `Store of ${userId}` });
    const p = await addProduct(ds, { sellerId: store.id });
    await ds.getRepository(OrderItem).save(ds.getRepository(OrderItem).create({ orderId: order.id, productId: p.id, productName: 'Thing', qty: 1, priceUsd: 5, sellerId: store.id } as never));
    return store;
  }

  it('a seller can only link an order that holds one of THEIR store\'s lines (team members through their seat)', async () => {
    const store = await ownLine('s1');
    await expect(svc.open({ id: 's2', name: 'Other shop', role: 'seller' }, { subject: 'x y', message: 'hello there', orderId: order.id })).rejects.toThrow('Order not found.');
    const own = await svc.open(seller, { subject: 'My sale', message: 'hello there', orderId: order.id });
    expect(own.orderId).toBe(order.id);
    // A team member of that store may; one who never joined, or was removed, may not.
    const seat = ds.getRepository(SellerTeamMember);
    await seat.save(seat.create({ sellerId: store.id, userId: 'tm', emailHash: 'tm', email: 'tm@x.y', role: 'support', status: 'active', invitedBy: 's1' } as never));
    expect((await svc.open({ id: 'tm', name: 'Team', role: 'seller' }, { subject: 'Team ask', message: 'hello there', orderId: order.id })).orderId).toBe(order.id);
    await seat.update({ userId: 'tm' }, { status: 'removed' } as never);
    await expect(svc.open({ id: 'tm', name: 'Team', role: 'seller' }, { subject: 'Team ask', message: 'hello there', orderId: order.id })).rejects.toThrow('Order not found.');
    // No order at all stays fine, and a missing order id is refused like before.
    expect((await svc.open({ id: 's2', name: 'Other shop', role: 'seller' }, { subject: 'No order', message: 'hello there' })).orderId).toBeNull();
    await expect(svc.open(seller, { subject: 'x y', message: 'hello there', orderId: 'nope' })).rejects.toThrow('Order not found.');
  });

  it('an old line without a store on it counts through the listing it was bought from', async () => {
    const store = await addSeller(ds, { userId: 's1' });
    const p = await addProduct(ds, { sellerId: store.id });
    await ds.getRepository(OrderItem).save(ds.getRepository(OrderItem).create({ orderId: order.id, productId: p.id, productName: 'Thing', qty: 1, priceUsd: 5, sellerId: null } as never));
    expect((await svc.open(seller, { subject: 'Old line', message: 'hello there', orderId: order.id })).orderId).toBe(order.id);
  });

  it('a rider can only link an order they carry', async () => {
    await expect(svc.open(rider, { subject: 'x y', message: 'hello there', orderId: order.id })).rejects.toThrow('Order not found.');
    await ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderId: order.id, orderReference: 'SOM-1', riderId: 'r1', status: 'assigned', kind: 'delivery' } as never));
    expect((await svc.open(rider, { subject: 'My run', message: 'hello there', orderId: order.id })).orderId).toBe(order.id);
  });

  it('refuses an unknown order, another customer’s order, a foreign photo and an empty message', async () => {
    await expect(svc.open(customer, { subject: 'x y', message: 'hello there', orderId: 'nope' })).rejects.toThrow('Order not found.');
    await expect(svc.open({ id: 'c9', name: 'Other', role: 'customer' }, { subject: 'x y', message: 'hello there', orderId: order.id })).rejects.toThrow('Order not found.');
    await expect(svc.open(customer, { subject: 'x y', message: 'hello there', attachments: ['https://evil.example/a.png'] })).rejects.toThrow('uploaded');
    await expect(svc.open(customer, { subject: '', message: '' })).rejects.toThrow('required');
    expect((await svc.open(customer, { subject: 'x y', message: 'hello there', category: 'Not A Slug!' })).category).toBe('general');
  });

  it('reaches every admin role: one notice for all of them, and a live update for the owner and the admins', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    expect(titles('role:admins')).toEqual(['New support ticket']);
    expect(emitter.sent.some((e) => e.event === 'support:updated' && e.to === 'user:c1')).toBe(true);
    const toAdmins = emitter.sent.find((e) => e.event === 'support:updated' && e.to.includes('admin_finance') && e.to.includes('admin_marketing'));
    expect((toAdmins!.payload as SupportTicket).id).toBe(t.id);
  });
});

describe('replying', () => {
  it('an agent’s reply: pending, 1 unread for the owner, the agent takes the ticket, the owner is told', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    const r = await svc.reply(t.id, agent, 'How can I help?', [UP]);
    expect(r).toMatchObject({ status: 'pending', userUnread: 1, staffUnread: 1, assigneeId: 'a1', assigneeName: 'Agent' });
    expect(thread(r).map((m) => m.role)).toEqual(['customer', 'admin_support']);
    expect(thread(r)[1].attachments).toEqual([UP]);
    expect(notices).toContainEqual(expect.objectContaining({ to: 'c1', title: 'Support reply', body: `${t.reference}: How can I help?` }));
    // a second agent answering does not take it away
    expect((await svc.reply(t.id, agent2, 'Adding a note')).assigneeId).toBe('a1');
  });

  it('the owner’s reply: open again, 1 more unread for the agents, the assigned agent is told; unassigned goes to the support role', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    const a = await svc.reply(t.id, customer, 'Still waiting');
    expect(a).toMatchObject({ status: 'open', staffUnread: 2 });
    expect(titles('role:admin_support')).toEqual(['New reply on a ticket']);
    await svc.reply(t.id, agent, 'On it');
    await svc.reply(t.id, customer, 'Thanks');
    expect(titles('a1')).toEqual(['New reply on a ticket']);
    expect(titles('role:admin_support')).toHaveLength(1);
  });

  it('only the owner and admins; a message or a photo is needed', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    await expect(svc.reply(t.id, seller, 'Hi')).rejects.toThrow('Ticket not found.');
    await expect(svc.reply('missing', customer, 'Hi')).rejects.toThrow('Ticket not found.');
    await expect(svc.reply(t.id, customer, '   ')).rejects.toThrow('Write a message first');
    expect(thread(await svc.reply(t.id, customer, '', [UP]))).toHaveLength(2);
    expect(notices.find((n) => n.title === 'New reply on a ticket')?.body).toContain('📷');
  });

  it('simultaneous replies from both sides are all kept', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    await Promise.all([
      ...Array.from({ length: 6 }, (_, i) => svc.reply(t.id, customer, `customer ${i}`)),
      ...Array.from({ length: 6 }, (_, i) => svc.reply(t.id, agent, `agent ${i}`)),
    ]);
    const full = await svc.get(customer, t.id);
    expect(thread(full)).toHaveLength(13);
    expect(full.userUnread).toBe(6);
    expect(full.staffUnread).toBe(7);
  });
});

describe('reading, status and assignment', () => {
  it('markRead zeroes the reader’s own counter only, and only for the owner or an agent', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    await svc.reply(t.id, agent, 'Hi');
    expect(await svc.markRead(customer, t.id)).toMatchObject({ userUnread: 0, staffUnread: 1 });
    expect(await svc.markRead(agent, t.id)).toMatchObject({ userUnread: 0, staffUnread: 0 });
    await expect(svc.markRead(seller, t.id)).rejects.toThrow('Ticket not found.');
  });

  it('validates the status and tells the owner when it is resolved, closed or reopened', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    await expect(svc.setStatus(t.id, 'banana' as never)).rejects.toThrow('Status must be one of: open, pending, resolved, closed.');
    await expect(svc.setStatus('missing', 'closed')).rejects.toThrow('Ticket not found.');
    await svc.setStatus(t.id, 'resolved');
    await svc.setStatus(t.id, 'resolved');
    await svc.setStatus(t.id, 'closed');
    await svc.setStatus(t.id, 'open');
    expect(titles('c1')).toEqual(['Ticket resolved', 'Ticket closed', 'Ticket reopened']);
  });

  it('a closed ticket cannot be replied to (it would silently reopen): customers open a new one, agents reopen it first; a resolved one still takes a reply', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    await svc.setStatus(t.id, 'resolved');
    expect((await svc.reply(t.id, customer, 'One more thing')).status).toBe('open'); // resolved -> the customer reopens it by writing
    await svc.setStatus(t.id, 'closed');
    const before = thread(await svc.get(customer, t.id)).length;
    await expect(svc.reply(t.id, customer, 'Hello again?')).rejects.toThrow('This ticket is closed. Open a new ticket if you still need help.');
    await expect(svc.reply(t.id, agent, 'Hi')).rejects.toThrow('This ticket is closed. Reopen it first.');
    const after = await svc.get(customer, t.id);
    expect(thread(after)).toHaveLength(before); // nothing was written
    expect(after).toMatchObject({ status: 'closed', staffUnread: 2 }); // only the first reply counted
    await svc.setStatus(t.id, 'open');
    expect((await svc.reply(t.id, agent, 'Back with you')).status).toBe('pending');
  });

  it('assigns to an active admin account, tells them, and can send it back to the queue', async () => {
    const t = await svc.open(customer, { subject: 'Hello', message: 'Anyone there?' });
    await expect(svc.assign(customer, t.id, 'a1')).rejects.toThrow('Admins only.');
    await expect(svc.assign(agent, t.id, 'c1')).rejects.toThrow('active admin account');
    await expect(svc.assign(agent, t.id, 'ghost')).rejects.toThrow('active admin account');
    const a = await svc.assign(agent, t.id, 'a2');
    expect(a).toMatchObject({ assigneeId: 'a2', assigneeName: 'Agent Two' });
    expect(titles('a2')).toEqual(['Ticket assigned to you']);
    await svc.assign(agent, t.id, 'a1'); // to myself: no notice
    expect(titles('a1')).toEqual([]);
    expect(await svc.assign(agent, t.id, null)).toMatchObject({ assigneeId: null, assigneeName: null });
    await ds.getRepository(User).update({ id: 'a2' }, { active: false });
    await expect(svc.assign(agent, t.id, 'a2')).rejects.toThrow('active admin account');
  });

  it('lists: people see their own, agents everyone’s (filterable)', async () => {
    const a = await svc.open(customer, { subject: 'One', message: 'First problem' });
    await svc.open(seller, { subject: 'Two', message: 'Second problem' });
    await svc.reply(a.id, agent, 'Hi');
    expect(await svc.list(customer)).toHaveLength(1);
    expect(await svc.list(rider)).toHaveLength(0);
    expect(await svc.list(agent)).toHaveLength(2);
    expect(await svc.list(agent, { status: 'pending' })).toHaveLength(1);
    expect(await svc.list(agent, { assignee: 'me' })).toHaveLength(1);
    expect(await svc.list(agent2, { assignee: 'me' })).toHaveLength(0);
    await expect(svc.get(seller, a.id)).rejects.toThrow('Ticket not found.');
    expect((await svc.get(agent, a.id)).id).toBe(a.id);
  });
});
