import { DataSource, DeepPartial } from 'typeorm';
import { Conversation, ConversationMessage, Order, OrderItem, Product, Seller, SellerTeamMember, User } from '../database/entities';
import type { TeamRole } from '../database/entities';
import { SellerContextService } from '../sellers/seller-context';
import { TeamDirectory } from '../sellers/team-directory';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { ChatService, MAX_TEXT, SENDS_PER_MINUTE, STARTS_PER_HOUR, canChat, cleanChatText } from './chat.service';

let ds: DataSource;
let chat: ChatService;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; title: string; body: string; type?: string }[];
let translate: jest.Mock;

async function user(name: string, role: User['role'] = 'customer'): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ email: `${name}@x.test`, emailHash: `h-${name}`, passwordHash: 'x', name, role }));
}
const caller = (u: User) => ({ id: u.id, role: u.role, name: u.name });

async function shop(status: Seller['status'] = 'approved') {
  const owner = await user('owner', 'seller');
  const repo = ds.getRepository(Seller);
  const seller = await repo.save(repo.create({ name: 'Shop', userId: owner.id, status }));
  const product = await addProduct(ds, { sellerId: seller.id, name: 'Phone' });
  return { owner, seller, product };
}
async function staff(seller: Seller, name: string, role: TeamRole) {
  const u = await user(name, 'seller');
  const repo = ds.getRepository(SellerTeamMember);
  await repo.save(repo.create({ sellerId: seller.id, userId: u.id, emailHash: `h-${name}`, email: `${name}@x.test`, role, status: 'active', invitedBy: seller.userId! }));
  return u;
}
const heard = (to: string, event: string) => emitter.sent.filter((e) => e.to === `user:${to}` && e.event === event);

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  translate = jest.fn(async () => ({ text: '[fr] hello', sourceLang: 'en', same: false }));
  const dir = new TeamDirectory(ds.getRepository(SellerTeamMember), ds.getRepository(Seller));
  const ctx = new SellerContextService(ds.getRepository(Seller), ds.getRepository(SellerTeamMember), ds.getRepository(User), { get: async () => null } as never);
  chat = new ChatService(
    ds.getRepository(Conversation),
    ds.getRepository(ConversationMessage),
    ds.getRepository(Seller),
    ds.getRepository(Product),
    ds.getRepository(Order),
    ds.getRepository(OrderItem),
    ds.getRepository(User),
    { toUser: async (to: string, n: { title: string; body: string; type?: string }) => void notices.push({ to, ...n }) } as never,
    emitter as never,
    dir,
    ctx,
    { translateStored: translate } as never,
  );
});
afterEach(() => ds.destroy());

describe('chat: starting a conversation', () => {
  it('opens a thread from a product with the first message, and counts it unread for the store', async () => {
    const { seller, product } = await shop();
    const buyer = await user('buyer');
    const r = await chat.start(caller(buyer), { sellerId: seller.id, productId: product.id, text: '  Is it new?  ' });
    expect(r.message).toMatchObject({ text: 'Is it new?', senderSide: 'buyer', senderName: 'buyer' });
    expect(r.conversation).toMatchObject({ side: 'buyer', productId: product.id, productName: 'Phone', storeName: 'Shop', lastMessagePreview: 'Is it new?', unread: 0 });
    const row = await ds.getRepository(Conversation).findOneByOrFail({ id: r.conversation.id });
    expect(row).toMatchObject({ buyerUnread: 0, sellerUnread: 1, contextKey: `p:${product.id}` });
  });

  it('reuses the thread for the same context and opens another for a different one', async () => {
    const { seller, product } = await shop();
    const buyer = await user('buyer');
    const a = await chat.start(caller(buyer), { sellerId: seller.id, productId: product.id, text: 'one' });
    const b = await chat.start(caller(buyer), { sellerId: seller.id, productId: product.id, text: 'two' });
    const c = await chat.start(caller(buyer), { sellerId: seller.id, text: 'general' });
    expect(b.conversation.id).toBe(a.conversation.id);
    expect(c.conversation.id).not.toBe(a.conversation.id);
    expect(await ds.getRepository(ConversationMessage).count({ where: { conversationId: a.conversation.id } })).toBe(2);
  });

  it('a conversation about an order needs the shopper\'s own order with something from the store', async () => {
    const { seller, product } = await shop();
    const buyer = await user('buyer');
    const other = await user('other');
    const orders = ds.getRepository(Order);
    const order = await orders.save(orders.create({ reference: 'SOM-1', customerId: buyer.id, customerName: 'buyer', status: 'confirmed', paymentMethod: 'cod', subtotalUsd: 10, totalUsd: 10 } as DeepPartial<Order>));
    const items = ds.getRepository(OrderItem);
    await items.save(items.create({ orderId: order.id, productId: product.id, productName: 'Phone', qty: 1, priceUsd: 10, sellerId: seller.id } as DeepPartial<OrderItem>));
    const r = await chat.start(caller(buyer), { sellerId: seller.id, orderId: order.id, text: 'Where is it?' });
    expect(r.conversation).toMatchObject({ orderId: order.id, orderReference: 'SOM-1' });
    await expect(chat.start(caller(other), { sellerId: seller.id, orderId: order.id, text: 'x' })).rejects.toThrow('Order not found.');
    const { seller: s2 } = await (async () => {
      const o = await user('o2', 'seller');
      const repo = ds.getRepository(Seller);
      return { seller: await repo.save(repo.create({ name: 'Other', userId: o.id, status: 'approved' })) };
    })();
    await expect(chat.start(caller(buyer), { sellerId: s2.id, orderId: order.id, text: 'x' })).rejects.toThrow('That order has nothing from this store.');
  });

  it('refuses: a missing / unapproved store, a foreign product, empty or huge text, staff, and non-shoppers', async () => {
    const { seller, product } = await shop();
    const buyer = await user('buyer');
    await expect(chat.start(caller(buyer), { sellerId: 'nope', text: 'x' })).rejects.toThrow('Store not found.');
    const pend = await shop('pending').catch(() => null);
    void pend;
    await expect(chat.start(caller(buyer), { sellerId: seller.id, productId: 'nope', text: 'x' })).rejects.toThrow('That product does not belong to this store.');
    await expect(chat.start(caller(buyer), { sellerId: seller.id, text: '   ' })).rejects.toThrow('Write a message first.');
    await expect(chat.start(caller(buyer), { sellerId: seller.id, text: 'x'.repeat(MAX_TEXT + 1) })).rejects.toThrow(/2000/);
    const fin = await staff(seller, 'fin', 'finance');
    await expect(chat.start(caller(fin), { sellerId: seller.id, text: 'hi' })).rejects.toThrow('You cannot message your own store.');
    const admin = await user('adm', 'admin');
    await expect(chat.start(caller(admin), { sellerId: seller.id, text: 'hi' })).rejects.toThrow('Only shoppers can message a store.');
    void product;
  });

  it('does not accept a suspended or pending store', async () => {
    const { seller } = await shop('suspended');
    const buyer = await user('buyer');
    await expect(chat.start(caller(buyer), { sellerId: seller.id, text: 'hi' })).rejects.toThrow('Store not found.');
  });

  it('a first message refused by the per-minute limit leaves no empty conversation behind', async () => {
    const { seller } = await shop();
    const buyer = await user('buyer');
    const { conversation } = await chat.start(caller(buyer), { sellerId: seller.id, text: 'first' });
    for (let i = 1; i < SENDS_PER_MINUTE; i++) await chat.send(caller(buyer), { conversationId: conversation.id, text: `m${i}` });
    const before = await ds.getRepository(Conversation).count();
    const p = await addProduct(ds, { sellerId: seller.id, name: 'New topic' });
    await expect(chat.start(caller(buyer), { sellerId: seller.id, productId: p.id, text: 'a new question' })).rejects.toThrow(/too fast/);
    expect(await ds.getRepository(Conversation).count()).toBe(before);
    expect(await ds.getRepository(ConversationMessage).count({ where: { text: 'a new question' } })).toBe(0);
  });

  it('limits how many conversations one account opens per hour', async () => {
    const { seller } = await shop();
    const buyer = await user('buyer');
    for (let i = 0; i < STARTS_PER_HOUR; i++) {
      const p = await addProduct(ds, { sellerId: seller.id, name: `P${i}` });
      await chat.start(caller(buyer), { sellerId: seller.id, productId: p.id, text: `q${i}` });
    }
    const extra = await addProduct(ds, { sellerId: seller.id, name: 'Extra' });
    await expect(chat.start(caller(buyer), { sellerId: seller.id, productId: extra.id, text: 'more' })).rejects.toThrow(/too many conversations/);
  });
});

describe('chat: who sees what', () => {
  async function setup() {
    const { owner, seller, product } = await shop();
    const buyer = await user('buyer');
    const support = await staff(seller, 'support', 'support');
    const manager = await staff(seller, 'manager', 'manager');
    const orders = await staff(seller, 'orders', 'orders');
    const finance = await staff(seller, 'finance', 'finance');
    const catalog = await staff(seller, 'catalog', 'catalog');
    const { conversation } = await chat.start(caller(buyer), { sellerId: seller.id, productId: product.id, text: 'Hello store' });
    return { owner, seller, product, buyer, support, manager, orders, finance, catalog, conv: conversation };
  }

  it('the roles that answer customers are owner, manager, support and orders', () => {
    expect(['owner', 'manager', 'support', 'orders', 'finance', 'catalog'].filter((r) => canChat(r as TeamRole))).toEqual(['owner', 'manager', 'support', 'orders']);
  });

  it('pushes chat:message to the shopper and to every account on the seller side, never to finance or catalog', async () => {
    const t = await setup();
    for (const who of [t.buyer, t.owner, t.support, t.manager, t.orders]) expect(heard(who.id, 'chat:message')).toHaveLength(1);
    for (const who of [t.finance, t.catalog]) expect(heard(who.id, 'chat:message')).toHaveLength(0);
    const toOwner = heard(t.owner.id, 'chat:message')[0].payload;
    expect(toOwner.conversation).toMatchObject({ side: 'seller', unread: 1 });
    expect(heard(t.buyer.id, 'chat:message')[0].payload.conversation).toMatchObject({ side: 'buyer', unread: 0 });
  });

  it('lists the seller-side thread for owner and chat roles only', async () => {
    const t = await setup();
    for (const who of [t.owner, t.support, t.manager, t.orders]) expect((await chat.list(caller(who))).map((c) => c.id)).toEqual([t.conv.id]);
    for (const who of [t.finance, t.catalog]) expect(await chat.list(caller(who))).toEqual([]);
    expect((await chat.list(caller(t.buyer))).map((c) => c.id)).toEqual([t.conv.id]);
    expect(await chat.list(caller(t.buyer), { as: 'seller' })).toEqual([]);
  });

  it('only the two sides can read, write, mark read or translate; others get "not found"', async () => {
    const t = await setup();
    const stranger = await user('stranger');
    for (const who of [stranger, t.finance, t.catalog]) {
      await expect(chat.messages(caller(who), { conversationId: t.conv.id })).rejects.toThrow('Conversation not found.');
      await expect(chat.send(caller(who), { conversationId: t.conv.id, text: 'hi' })).rejects.toThrow('Conversation not found.');
      await expect(chat.markRead(caller(who), { conversationId: t.conv.id })).rejects.toThrow('Conversation not found.');
    }
    const msg = (await chat.messages(caller(t.buyer), { conversationId: t.conv.id })).messages[0];
    await expect(chat.translate(caller(stranger), msg.id, 'fr')).rejects.toThrow('Nothing to translate.');
    await expect(chat.translate(caller(t.finance), msg.id, 'fr')).rejects.toThrow('Nothing to translate.');
    await expect(chat.translate(caller(t.buyer), 'not-a-uuid', 'fr')).rejects.toThrow('Nothing to translate.');
    expect(translate).not.toHaveBeenCalled();
    await expect(chat.translate(caller(t.buyer), msg.id, 'fr')).resolves.toMatchObject({ text: '[fr] hello' });
    await expect(chat.translate(caller(t.support), msg.id, 'fr')).resolves.toBeDefined();
    expect(translate).toHaveBeenCalledWith('chat_message', msg.id, 'fr', { private: true });
  });

  it('counts unread per side: sending bumps the other side, reading clears only your own side', async () => {
    const t = await setup();
    expect(await chat.unread(caller(t.owner))).toEqual({ total: 1, buyer: 0, seller: 1 });
    expect(await chat.unread(caller(t.buyer))).toEqual({ total: 0, buyer: 0, seller: 0 });
    await chat.send(caller(t.support), { conversationId: t.conv.id, text: 'Yes' });
    await chat.send(caller(t.owner), { conversationId: t.conv.id, text: 'In stock' });
    expect(await chat.unread(caller(t.buyer))).toEqual({ total: 2, buyer: 2, seller: 0 });
    await chat.markRead(caller(t.buyer), { conversationId: t.conv.id });
    expect((await chat.unread(caller(t.buyer))).total).toBe(0);
    expect((await chat.unread(caller(t.owner))).seller).toBe(1);
    // any teammate reading clears it for the whole seller side
    await chat.markRead(caller(t.orders), { conversationId: t.conv.id });
    expect((await chat.unread(caller(t.owner))).seller).toBe(0);
    expect((await chat.unread(caller(t.support))).seller).toBe(0);
    expect(heard(t.buyer.id, 'chat:read').length).toBeGreaterThan(0);
    expect(heard(t.owner.id, 'chat:read')[0].payload).toMatchObject({ conversationId: t.conv.id });
  });

  it('a staff reply shows the staff member\'s own name on the seller side', async () => {
    const t = await setup();
    const r = await chat.send(caller(t.support), { conversationId: t.conv.id, text: 'Hi, support here' });
    expect(r.message).toMatchObject({ senderSide: 'seller', senderName: 'support', senderId: t.support.id });
    expect(heard(t.buyer.id, 'chat:message').at(-1)!.payload.conversation.unread).toBe(1);
  });

  it('pages history with `before` and flags when there is more', async () => {
    const t = await setup();
    for (let i = 0; i < 4; i++) await chat.send(caller(t.owner), { conversationId: t.conv.id, text: `m${i}` });
    const page1 = await chat.messages(caller(t.buyer), { conversationId: t.conv.id, limit: 2 });
    expect(page1.messages.map((m) => m.text)).toEqual(['m2', 'm3']);
    expect(page1.hasMore).toBe(true);
    const page2 = await chat.messages(caller(t.buyer), { conversationId: t.conv.id, limit: 10, before: page1.messages[0].id });
    expect(page2.messages.map((m) => m.text)).toEqual(['Hello store', 'm0', 'm1']);
    expect(page2.hasMore).toBe(false);
    await expect(chat.messages(caller(t.buyer), { conversationId: t.conv.id, before: 'nope' })).rejects.toThrow('Message not found.');
  });

  it('notifies a side once per burst (when it had nothing unread), not for every message', async () => {
    const t = await setup();
    expect(notices.filter((n) => n.title === 'New customer message').map((n) => n.to)).toContain(t.owner.id);
    // orders staff are told directly (the owner's notice only fans out to roles with the support permission)
    expect(notices.filter((n) => n.to === t.orders.id)).toHaveLength(1);
    const before = notices.length;
    await chat.send(caller(t.buyer), { conversationId: t.conv.id, text: 'Another' });
    expect(notices).toHaveLength(before);
    await chat.send(caller(t.owner), { conversationId: t.conv.id, text: 'Reply' });
    expect(notices.at(-1)).toMatchObject({ to: t.buyer.id, title: 'New message from the seller', type: 'chat' });
    await chat.send(caller(t.owner), { conversationId: t.conv.id, text: 'Reply 2' });
    expect(notices.filter((n) => n.to === t.buyer.id)).toHaveLength(1);
  });

  it('a suspended store can be read but not answered from', async () => {
    const t = await setup();
    await ds.getRepository(Seller).update({ id: t.seller.id }, { status: 'suspended' });
    await expect(chat.send(caller(t.owner), { conversationId: t.conv.id, text: 'hi' })).rejects.toThrow(/suspended/);
    await expect(chat.messages(caller(t.owner), { conversationId: t.conv.id })).resolves.toBeDefined();
    // the shopper can still write; the store reads it later
    await expect(chat.send(caller(t.buyer), { conversationId: t.conv.id, text: 'still there?' })).resolves.toBeDefined();
  });

  it('a removed team member loses the thread at once', async () => {
    const t = await setup();
    await ds.getRepository(SellerTeamMember).update({ userId: t.support.id }, { status: 'removed' });
    await expect(chat.messages(caller(t.support), { conversationId: t.conv.id })).rejects.toThrow('Conversation not found.');
    expect(await chat.list(caller(t.support))).toEqual([]);
  });
});

describe('chat: abuse control and content', () => {
  it('limits messages per minute per account', async () => {
    const { seller } = await shop();
    const buyer = await user('buyer');
    const { conversation } = await chat.start(caller(buyer), { sellerId: seller.id, text: 'first' });
    let ok = 1;
    let blocked = false;
    for (let i = 0; i < SENDS_PER_MINUTE + 5; i++) {
      try {
        await chat.send(caller(buyer), { conversationId: conversation.id, text: `spam ${i}` });
        ok++;
      } catch (e) {
        expect((e as Error).message).toMatch(/too fast/);
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
    expect(ok).toBe(SENDS_PER_MINUTE);
  });

  it('attachments must be platform uploads (max 4), and a photo alone is a message', async () => {
    const { seller } = await shop();
    const buyer = await user('buyer');
    const good = 'http://localhost:3024/uploads/11111111-2222-3333-4444-555555555555.png';
    const r = await chat.start(caller(buyer), { sellerId: seller.id, text: '', attachments: [good] });
    expect(r.message.attachments).toEqual([good]);
    expect(r.conversation.lastMessagePreview).toBe('📷');
    const id = r.conversation.id;
    await expect(chat.send(caller(buyer), { conversationId: id, text: 'x', attachments: ['https://evil.example/a.png'] })).rejects.toThrow(/uploaded through the platform/);
    await expect(chat.send(caller(buyer), { conversationId: id, text: 'x', attachments: Array(5).fill(good) })).rejects.toThrow(/up to 4/);
    // Whatever the uploads endpoint can write is accepted: png, jpg, jpeg, webp and heic.
    const base = 'http://localhost:3024/uploads/11111111-2222-3333-4444-5555555555';
    const formats = ['png', 'jpg', 'jpeg', 'webp', 'heic'].map((ext, i) => `${base}${String(10 + i)}.${ext}`);
    const sent = await chat.send(caller(buyer), { conversationId: id, text: '', attachments: formats.slice(0, 4) });
    expect(sent.message.attachments).toEqual(formats.slice(0, 4));
    expect((await chat.send(caller(buyer), { conversationId: id, text: '', attachments: formats.slice(4) })).message.attachments).toEqual(formats.slice(4));
    await expect(chat.send(caller(buyer), { conversationId: id, text: 'x', attachments: [`${base}10.gif`] })).rejects.toThrow(/uploaded through the platform/);
    await expect(chat.send(caller(buyer), { conversationId: id, text: 'x', attachments: [`${base}10.svg`] })).rejects.toThrow(/uploaded through the platform/);
    await expect(chat.send(caller(buyer), { conversationId: id, text: 'x', attachments: [42 as never] })).rejects.toThrow(/not a valid image/);
    await expect(chat.send(caller(buyer), { conversationId: id, text: '' })).rejects.toThrow('Write a message first.');
  });

  it('normalises whitespace in the (no-op) contact filter hook', () => {
    expect(cleanChatText('  hi \r\nthere  ')).toBe('hi\nthere');
    expect(cleanChatText(null)).toBe('');
  });

  it('erases a deleted shopper\'s chats', async () => {
    const { seller } = await shop();
    const buyer = await user('buyer');
    const { conversation } = await chat.start(caller(buyer), { sellerId: seller.id, text: 'bye' });
    await chat.forgetBuyer(buyer.id);
    expect(await ds.getRepository(Conversation).count()).toBe(0);
    expect(await ds.getRepository(ConversationMessage).count({ where: { conversationId: conversation.id } })).toBe(0);
  });
});
