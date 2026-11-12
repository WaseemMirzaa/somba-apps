import { DataSource } from 'typeorm';
import { Conversation, ConversationMessage, Order, OrderItem, Product, Seller, SellerTeamMember, Translation, User } from '../database/entities';
import { SellerContextService } from '../sellers/seller-context';
import { TeamDirectory } from '../sellers/team-directory';
import { FakeTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import type { TranslatorProvider } from '../translation/translator.provider';
import { addProduct, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { ChatService } from './chat.service';

let ds: DataSource;
let chat: ChatService;
let emitter: ReturnType<typeof recordingEmitter>;
let fake: FakeTranslator;
let tr: TranslationService;

async function user(name: string, role: User['role'] = 'customer', locale: 'en' | 'fr' = 'en'): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ email: `${name}@x.test`, emailHash: `h-${name}`, passwordHash: 'x', name, role, locale }));
}
const caller = (u: User) => ({ id: u.id, role: u.role, name: u.name });

function build(provider: TranslatorProvider) {
  tr = testTranslations(ds, provider);
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
    { toUser: async () => undefined } as never,
    emitter as never,
    dir,
    ctx,
    tr,
  );
}
const broken: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('503'); }, detect: async () => { throw new Error('503'); } };

async function shop() {
  const owner = await user('owner', 'seller');
  const repo = ds.getRepository(Seller);
  const seller = await repo.save(repo.create({ name: 'Shop', userId: owner.id, status: 'approved' }));
  const product = await addProduct(ds, { sellerId: seller.id, name: 'Phone' });
  return { owner, seller, product };
}
const rowsOf = (id: string) => ds.getRepository(Translation).find({ where: { entityId: id }, order: { locale: 'ASC' } });
const heard = (to: string) => emitter.sent.filter((e) => e.to === `user:${to}` && e.event === 'chat:message');

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  fake = new FakeTranslator();
  build(fake);
});
afterEach(() => ds.destroy());

describe('chat: translated before they are stored', () => {
  it('start and send store the text and its row, and return and push both languages to both sides', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const first = await chat.start(caller(buyer), { sellerId: seller.id, text: 'Is it new?' });
    const expected = { sourceLang: 'en', en: 'Is it new?', fr: '[fr] Is it new?' };
    expect(first.message.text).toBe('Is it new?');
    expect(first.message.textI18n).toEqual(expected);
    expect((await rowsOf(first.message.id)).map((r) => [r.entityType, r.field, r.locale, r.origin])).toEqual([['chat_message', 'text', 'fr', 'machine']]);
    expect(heard(owner.id)[0].payload.message.textI18n).toEqual(expected);
    expect(heard(buyer.id)[0].payload.message.textI18n).toEqual(expected);
    expect(first.conversation.lastMessageI18n).toEqual({ sourceLang: 'en', en: 'Is it new?', fr: '[fr] Is it new?' });

    const sent = await chat.send(caller(owner), { conversationId: first.conversation.id, text: 'Oui, il est neuf' });
    expect(sent.message.textI18n).toEqual({ sourceLang: 'fr', fr: 'Oui, il est neuf', en: '[en] Oui, il est neuf' });
  });

  it('the sender\'s language is the detect hint: a French sender costs one call', async () => {
    const { seller } = await shop();
    const buyer = await user('acheteur', 'customer', 'fr');
    fake.calls.length = 0;
    await chat.start(caller(buyer), { sellerId: seller.id, text: 'Très bon produit, livraison rapide' });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].to).toBe('en');
  });

  it('history carries textI18n per message (one lookup for the whole page) and the conversation lists carry lastMessageI18n', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const first = await chat.start(caller(buyer), { sellerId: seller.id, text: 'Is it new?' });
    await chat.send(caller(owner), { conversationId: first.conversation.id, text: 'Oui, il est neuf' });
    await chat.send(caller(buyer), { conversationId: first.conversation.id, text: 'Great, thanks a lot' });
    const spy = jest.spyOn(ds.getRepository(Translation), 'find');
    const h = await chat.messages(caller(buyer), { conversationId: first.conversation.id });
    expect(spy).toHaveBeenCalledTimes(2); // the page of messages, and the conversation's last-message preview
    expect(h.messages.map((m) => m.textI18n?.sourceLang)).toEqual(['en', 'fr', 'en']);
    expect(h.conversation.lastMessageI18n).toEqual({ sourceLang: 'en', en: 'Great, thanks a lot', fr: '[fr] Great, thanks a lot' });
    spy.mockClear();
    const asBuyer = await chat.list(caller(buyer), { as: 'buyer' });
    const asSeller = await chat.list(caller(owner), { as: 'seller' });
    expect(spy).toHaveBeenCalledTimes(2); // one batched lookup per list, whatever the number of conversations
    for (const l of [asBuyer, asSeller]) expect(l[0].lastMessageI18n?.fr).toBe('[fr] Great, thanks a lot');
    const push = heard(owner.id).at(-1)!.payload.conversation;
    expect(push.lastMessageI18n?.fr).toBe('[fr] Great, thanks a lot');
  });

  it('a long last message is cut like lastMessagePreview, in each language', async () => {
    const { seller } = await shop();
    const buyer = await user('buyer');
    const text = `Hello ${'there '.repeat(60)}`.trim();
    const r = await chat.start(caller(buyer), { sellerId: seller.id, text });
    expect(r.conversation.lastMessagePreview).toHaveLength(140);
    expect(r.conversation.lastMessageI18n?.en).toBe(r.conversation.lastMessagePreview);
    expect(r.conversation.lastMessageI18n?.fr).toHaveLength(140);
  });

  it('a failing translator still sends: no error, no i18n anywhere', async () => {
    build(broken);
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const r = await chat.start(caller(buyer), { sellerId: seller.id, text: 'Is it new?' });
    expect(r.message.text).toBe('Is it new?');
    expect('textI18n' in r.message).toBe(false);
    expect('lastMessageI18n' in r.conversation).toBe(false);
    expect(await ds.getRepository(ConversationMessage).count()).toBe(1);
    expect('textI18n' in heard(owner.id)[0].payload.message).toBe(false);
    const h = await chat.messages(caller(buyer), { conversationId: r.conversation.id });
    expect('textI18n' in h.messages[0]).toBe(false);
  });

  it('one message costs one detect call for an English sender', async () => {
    const { seller } = await shop();
    const buyer = await user('buyer');
    fake.calls.length = 0;
    const r = await chat.start(caller(buyer), { sellerId: seller.id, text: 'Is it new?' });
    expect(r.message.textI18n).toBeDefined();
    expect(fake.calls).toHaveLength(1);
  });
});
