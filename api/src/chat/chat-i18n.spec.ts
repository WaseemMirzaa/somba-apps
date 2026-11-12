import { DataSource } from 'typeorm';
import { Conversation, ConversationMessage, Order, Product, Seller, Translation, User } from '../database/entities';
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
  chat = new ChatService(ds.getRepository(Conversation), ds.getRepository(ConversationMessage), ds.getRepository(Seller), ds.getRepository(Product), ds.getRepository(Order), emitter as never, tr);
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
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  fake = new FakeTranslator();
  build(fake);
});
afterEach(() => ds.destroy());

describe('chat history: translated before it is stored, read in both languages', () => {
  it('imported messages keep their text and a translation row; reads carry textI18n and lastMessageI18n', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const conv = await chat.importHistory({
      buyer: caller(buyer),
      sellerId: seller.id,
      messages: [
        { side: 'buyer', sender: caller(buyer), text: 'Is it new?', at: at(30) },
        { side: 'seller', sender: caller(owner), text: 'Oui, il est neuf', at: at(20) },
        { side: 'buyer', sender: caller(buyer), text: 'Great, thanks a lot', at: at(10) },
      ],
    });
    const stored = await ds.getRepository(ConversationMessage).find({ where: { conversationId: conv.id }, order: { createdAt: 'ASC' } });
    expect((await rowsOf(stored[0].id)).map((r) => [r.entityType, r.field, r.locale, r.origin])).toEqual([['chat_message', 'text', 'fr', 'machine']]);
    const spy = jest.spyOn(ds.getRepository(Translation), 'find');
    const h = await chat.messages(caller(buyer), { conversationId: conv.id });
    expect(spy).toHaveBeenCalledTimes(2); // the page of messages, and the conversation's last-message preview
    expect(h.messages.map((m) => m.textI18n?.sourceLang)).toEqual(['en', 'fr', 'en']);
    expect(h.messages[1].textI18n).toEqual({ sourceLang: 'fr', fr: 'Oui, il est neuf', en: '[en] Oui, il est neuf' });
    expect(h.conversation.lastMessageI18n).toEqual({ sourceLang: 'en', en: 'Great, thanks a lot', fr: '[fr] Great, thanks a lot' });
    spy.mockClear();
    const listed = await chat.list(caller(buyer), {});
    expect(spy).toHaveBeenCalledTimes(1); // one batched lookup per list, whatever the number of conversations
    expect(listed[0].lastMessageI18n?.fr).toBe('[fr] Great, thanks a lot');
  });

  it('support reads the same bilingual history, list and messages', async () => {
    const { seller, owner } = await shop();
    const buyer = await user('buyer');
    const support = await user('support', 'admin_support');
    const conv = await chat.importHistory({
      buyer: caller(buyer),
      sellerId: seller.id,
      messages: [
        { side: 'buyer', sender: caller(buyer), text: 'Is it new?', at: at(30) },
        { side: 'seller', sender: caller(owner), text: 'Oui, il est neuf', at: at(20) },
      ],
    });
    const list = await chat.adminList(caller(support), {});
    expect(list[0].lastMessageI18n).toEqual({ sourceLang: 'fr', fr: 'Oui, il est neuf', en: '[en] Oui, il est neuf' });
    const page = await chat.adminMessages(caller(support), { conversationId: conv.id });
    expect(page.messages.map((m) => m.textI18n?.sourceLang)).toEqual(['en', 'fr']);
  });

  it('a long last message is cut like lastMessagePreview, in each language', async () => {
    const { seller } = await shop();
    const buyer = await user('buyer');
    const text = `Hello ${'there '.repeat(60)}`.trim();
    await chat.importHistory({ buyer: caller(buyer), sellerId: seller.id, messages: [{ side: 'buyer', sender: caller(buyer), text, at: at(5) }] });
    const [c] = await chat.list(caller(buyer), {});
    expect(c.lastMessagePreview).toHaveLength(140);
    expect(c.lastMessageI18n?.en).toBe(c.lastMessagePreview);
    expect(c.lastMessageI18n?.fr).toHaveLength(140);
  });

  it('a failing translator still stores the history: no error, no i18n anywhere', async () => {
    build(broken);
    const { seller } = await shop();
    const buyer = await user('buyer');
    const conv = await chat.importHistory({ buyer: caller(buyer), sellerId: seller.id, messages: [{ side: 'buyer', sender: caller(buyer), text: 'Is it new?', at: at(5) }] });
    expect(await ds.getRepository(ConversationMessage).count()).toBe(1);
    const h = await chat.messages(caller(buyer), { conversationId: conv.id });
    expect('textI18n' in h.messages[0]).toBe(false);
    expect('lastMessageI18n' in h.conversation).toBe(false);
  });
});
