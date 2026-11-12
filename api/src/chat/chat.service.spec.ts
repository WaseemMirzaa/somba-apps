import { DataSource } from 'typeorm';
import { Conversation, ConversationMessage, Order, Product, Seller, SellerTeamMember, User } from '../database/entities';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { CHAT_CLOSED, ChatService } from './chat.service';

let ds: DataSource;
let chat: ChatService;
let emitter: ReturnType<typeof recordingEmitter>;
let translate: jest.Mock;
/** What the translation service answers for a product's name: [English, French] by product id (none: the stored name in both). */
let productNames: Record<string, [string, string]>;

async function user(name: string, role: User['role'] = 'customer'): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ email: `${name}@x.test`, emailHash: `h-${name}`, passwordHash: 'x', name, role }));
}
const caller = (u: User) => ({ id: u.id, role: u.role, name: u.name });

async function shop(name = 'Shop') {
  const owner = await user(`owner-${name}`, 'seller');
  const repo = ds.getRepository(Seller);
  const seller = await repo.save(repo.create({ name, userId: owner.id, status: 'approved' }));
  const product = await addProduct(ds, { sellerId: seller.id, name: 'Phone' });
  return { owner, seller, product };
}
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

/** A past conversation, as the demo seed writes one (nothing else can create a chat now). */
async function history(buyer: User, seller: Seller, owner: User, productId: string | null = null, texts = ['Is it new?', 'Yes, brand new', 'Great, thanks']) {
  return chat.importHistory({
    buyer: caller(buyer),
    sellerId: seller.id,
    productId,
    messages: texts.map((text, i) => ({ side: i % 2 === 0 ? ('buyer' as const) : ('seller' as const), sender: caller(i % 2 === 0 ? buyer : owner), text, at: at(100 - i * 10) })),
  });
}

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  translate = jest.fn(async () => ({ text: '[fr] hello', sourceLang: 'en', same: false }));
  productNames = {};
  chat = new ChatService(
    ds.getRepository(Conversation),
    ds.getRepository(ConversationMessage),
    ds.getRepository(Seller),
    ds.getRepository(Product),
    ds.getRepository(Order),
    emitter as never,
    {
      translateStored: translate,
      translateForSave: async () => null,
      saveTranslated: async () => undefined,
      i18nFor: async () => new Map(),
      present: async (_type: string, rows: { id: string; name: string }[]) =>
        new Map(rows.map((r) => [r.id, { texts: { name: productNames[r.id]?.[0] ?? r.name, nameFr: productNames[r.id]?.[1] ?? r.name } }])),
    } as never,
  );
});
afterEach(() => ds.destroy());

describe('chat is closed: nobody starts or sends', () => {
  it('chat:start and chat:send refuse for every role with the same sentence, and write nothing', async () => {
    const { seller, product, owner } = await shop();
    const buyer = await user('buyer');
    const admin = await user('admin', 'admin');
    expect(CHAT_CLOSED).toBe('Messaging sellers is closed. Contact support from your account.');
    for (const who of [buyer, owner, admin]) {
      await expect(chat.start(caller(who), { sellerId: seller.id, productId: product.id, text: 'Is it new?' })).rejects.toThrow(CHAT_CLOSED);
    }
    const conv = await history(buyer, seller, owner);
    for (const who of [buyer, owner, admin]) {
      await expect(chat.send(caller(who), { conversationId: conv.id, text: 'hello' })).rejects.toThrow(CHAT_CLOSED);
    }
    expect(await ds.getRepository(ConversationMessage).count()).toBe(3); // only the history
    expect(await ds.getRepository(Conversation).count()).toBe(1);
    expect(emitter.sent).toHaveLength(0); // nothing is pushed
  });
});

describe('chat: the customer reads their own history', () => {
  it('lists and reads their own conversations, with the product named in both languages', async () => {
    const { seller, product, owner } = await shop();
    productNames[product.id] = ['Phone', 'Téléphone'];
    const buyer = await user('buyer');
    const conv = await history(buyer, seller, owner, product.id);
    const listed = await chat.list(caller(buyer), {});
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: conv.id, side: 'buyer', storeName: 'Shop', productName: 'Phone', productNameFr: 'Téléphone', lastMessagePreview: 'Great, thanks', unread: 0 });
    const read = await chat.messages(caller(buyer), { conversationId: conv.id });
    expect(read.messages.map((m) => [m.senderSide, m.text])).toEqual([
      ['buyer', 'Is it new?'],
      ['seller', 'Yes, brand new'],
      ['buyer', 'Great, thanks'],
    ]);
  });

  it('a product with no French name is named by its stored name in both fields; no product, no names', async () => {
    const { seller, product, owner } = await shop();
    const buyer = await user('buyer');
    await history(buyer, seller, owner, product.id);
    await chat.importHistory({ buyer: caller(buyer), sellerId: seller.id, messages: [{ side: 'buyer', sender: caller(buyer), text: 'a general question', at: at(5) }] });
    const listed = await chat.list(caller(buyer), {});
    expect(listed.find((c) => c.productId)).toMatchObject({ productName: 'Phone', productNameFr: 'Phone' });
    expect(listed.find((c) => !c.productId)).toMatchObject({ productId: null, productName: null, productNameFr: null });
  });

  it('the store side is gone: the owner and staff list nothing, read nothing, and see no unread', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const conv = await history(buyer, seller, owner);
    const staff = await user('staff', 'seller');
    await ds.getRepository(SellerTeamMember).save(ds.getRepository(SellerTeamMember).create({ sellerId: seller.id, userId: staff.id, emailHash: 'h', email: 's@x.test', role: 'support', status: 'active', invitedBy: owner.id }));
    for (const who of [owner, staff]) {
      expect(await chat.list(caller(who), { as: 'seller' })).toEqual([]);
      expect(await chat.list(caller(who), {})).toEqual([]);
      await expect(chat.messages(caller(who), { conversationId: conv.id })).rejects.toThrow('Conversation not found.');
      await expect(chat.markRead(caller(who), { conversationId: conv.id })).rejects.toThrow('Conversation not found.');
      expect(await chat.unread(caller(who))).toEqual({ total: 0, buyer: 0, seller: 0 });
    }
    // another customer cannot read it either: the same answer as for a missing chat
    const other = await user('other');
    await expect(chat.messages(caller(other), { conversationId: conv.id })).rejects.toThrow('Conversation not found.');
  });

  it('counts the customer\'s unread and clears it on mark-read', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const conv = await history(buyer, seller, owner);
    await ds.getRepository(Conversation).update({ id: conv.id }, { buyerUnread: 2 });
    expect(await chat.unread(caller(buyer))).toEqual({ total: 2, buyer: 2, seller: 0 });
    await chat.markRead(caller(buyer), { conversationId: conv.id });
    expect(await chat.unread(caller(buyer))).toEqual({ total: 0, buyer: 0, seller: 0 });
    expect(emitter.sent.filter((e) => e.event === 'chat:read')).toHaveLength(1);
  });

  it('pages history with `before` and flags when there is more', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const conv = await history(buyer, seller, owner, null, ['m1', 'm2', 'm3', 'm4', 'm5']);
    const newest = await chat.messages(caller(buyer), { conversationId: conv.id, limit: 2 });
    expect(newest.messages.map((m) => m.text)).toEqual(['m4', 'm5']);
    expect(newest.hasMore).toBe(true);
    const older = await chat.messages(caller(buyer), { conversationId: conv.id, limit: 2, before: newest.messages[0].id });
    expect(older.messages.map((m) => m.text)).toEqual(['m2', 'm3']);
    const oldest = await chat.messages(caller(buyer), { conversationId: conv.id, limit: 2, before: older.messages[0].id });
    expect(oldest.messages.map((m) => m.text)).toEqual(['m1']);
    expect(oldest.hasMore).toBe(false);
  });
});

describe('chat: support reads every conversation, read-only', () => {
  it('admin and support list every conversation with its length; filters narrow it', async () => {
    const a = await shop('Alpha');
    const b = await shop('Beta');
    const grace = await user('Grace');
    const jean = await user('Jean');
    const c1 = await history(grace, a.seller, a.owner, a.product.id);
    const c2 = await history(jean, b.seller, b.owner, null, ['Bonjour']);
    for (const role of ['admin', 'admin_support'] as const) {
      const who = await user(`staff-${role}`, role);
      const all = await chat.adminList(caller(who), {});
      expect(all.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
      expect(all.find((c) => c.id === c1.id)).toMatchObject({ messageCount: 3, buyerName: 'Grace', storeName: 'Alpha' });
      expect('side' in all[0]).toBe(false);
      expect('unread' in all[0]).toBe(false);
      expect((await chat.adminList(caller(who), { sellerId: b.seller.id })).map((c) => c.id)).toEqual([c2.id]);
      expect((await chat.adminList(caller(who), { buyerId: grace.id })).map((c) => c.id)).toEqual([c1.id]);
      expect((await chat.adminList(caller(who), { q: 'jea' })).map((c) => c.id)).toEqual([c2.id]);
      expect((await chat.adminList(caller(who), { q: 'alph' })).map((c) => c.id)).toEqual([c1.id]);
      expect(await chat.adminList(caller(who), { limit: 1 })).toHaveLength(1);
    }
  });

  it('reads any conversation\'s messages, paged, and changes nothing', async () => {
    const a = await shop();
    const grace = await user('Grace');
    const conv = await history(grace, a.seller, a.owner, null, ['m1', 'm2', 'm3']);
    await ds.getRepository(Conversation).update({ id: conv.id }, { buyerUnread: 1, sellerUnread: 1 });
    const admin = await user('support', 'admin_support');
    const page = await chat.adminMessages(caller(admin), { conversationId: conv.id, limit: 2 });
    expect(page.messages.map((m) => m.text)).toEqual(['m2', 'm3']);
    expect(page.hasMore).toBe(true);
    expect(page.conversation).toMatchObject({ id: conv.id, messageCount: 3, buyerName: 'Grace' });
    const older = await chat.adminMessages(caller(admin), { conversationId: conv.id, before: page.messages[0].id });
    expect(older.messages.map((m) => m.text)).toEqual(['m1']);
    // read-only: no unread counter moved, nothing was pushed
    expect(await ds.getRepository(Conversation).findOneByOrFail({ id: conv.id })).toMatchObject({ buyerUnread: 1, sellerUnread: 1 });
    expect(emitter.sent).toHaveLength(0);
    await expect(chat.adminMessages(caller(admin), { conversationId: 'nope' })).rejects.toThrow('Conversation not found.');
  });

  it('every other role is refused: customers, sellers, finance, marketing, moderation, operations, warehouse', async () => {
    const a = await shop();
    const grace = await user('Grace');
    const conv = await history(grace, a.seller, a.owner);
    for (const role of ['customer', 'seller', 'admin_finance', 'admin_marketing', 'admin_moderation', 'admin_operations', 'warehouse_staff', 'rider'] as const) {
      const who = await user(`who-${role}`, role);
      await expect(chat.adminList(caller(who), {})).rejects.toThrow('Not allowed.');
      await expect(chat.adminMessages(caller(who), { conversationId: conv.id })).rejects.toThrow('Not allowed.');
    }
  });

  it('support may translate a message of any conversation; strangers may not', async () => {
    const a = await shop();
    const grace = await user('Grace');
    const conv = await history(grace, a.seller, a.owner);
    const msg = await ds.getRepository(ConversationMessage).findOneByOrFail({ conversationId: conv.id, text: 'Is it new?' });
    const support = await user('support', 'admin_support');
    await expect(chat.translate(caller(support), msg.id, 'fr')).resolves.toBeDefined();
    await expect(chat.translate(caller(grace), msg.id, 'fr')).resolves.toBeDefined();
    const stranger = await user('stranger');
    await expect(chat.translate(caller(stranger), msg.id, 'fr')).rejects.toThrow('Nothing to translate.');
    await expect(chat.translate(caller(a.owner), msg.id, 'fr')).rejects.toThrow('Nothing to translate.');
  });
});

describe('chat: stored history', () => {
  it('importHistory reuses the thread for the same context and keeps the last message as the preview', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const a = await history(buyer, seller, owner);
    const b = await chat.importHistory({ buyer: caller(buyer), sellerId: seller.id, messages: [{ side: 'seller', sender: caller(owner), text: 'One more thing', at: at(1) }] });
    expect(b.id).toBe(a.id);
    expect(await ds.getRepository(ConversationMessage).count({ where: { conversationId: a.id } })).toBe(4);
    expect((await ds.getRepository(Conversation).findOneByOrFail({ id: a.id })).lastMessagePreview).toBe('One more thing');
  });

  it('erases a deleted shopper\'s chats', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const other = await user('other');
    await history(buyer, seller, owner);
    await history(other, seller, owner);
    await chat.forgetBuyer(buyer.id);
    expect(await ds.getRepository(Conversation).count()).toBe(1);
    expect(await ds.getRepository(ConversationMessage).count()).toBe(3);
  });
});
