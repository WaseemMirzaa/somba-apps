import { DataSource } from 'typeorm';
import {
  Conversation,
  ConversationMessage,
  DeviceToken,
  Notification,
  Order,
  OrderItem,
  Product,
  ProductQuestion,
  Review,
  ReviewHelpful,
  ReviewReport,
  Seller,
  SellerTeamMember,
  SupportMessage,
  SupportTicket,
  User,
} from '../database/entities';
import { ReviewsService } from '../content/reviews.service';
import { SupportService } from '../content/support.service';
import { SellerContextService } from '../sellers/seller-context';
import { TeamDirectory } from '../sellers/team-directory';
import { FakeTranslator, OffTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import type { TranslatorProvider } from '../translation/translator.provider';
import { addProduct, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

/**
 * "If the receiver's selected language is English the push must be English, if French, French", including the words
 * people typed: a notice that QUOTES a text quotes the version in the receiver's language. These run the real chain
 * (service -> NotificationsService -> PushService -> the FCM message) and read what each device is sent.
 */

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let fake: FakeTranslator;
let tr: TranslationService;
let notifications: NotificationsService;
let reviews: ReviewsService;
let support: SupportService;
let fcm: { tokens: string[]; notification: { title: string; body: string }; data: Record<string, string> }[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Push is fire-and-forget: let it land. */
const settle = () => sleep(150);
const off = new OffTranslator();

async function user(name: string, role: User['role'], locale: 'en' | 'fr'): Promise<User> {
  const repo = ds.getRepository(User);
  return repo.save(repo.create({ email: `${name}@x.test`, emailHash: `h-${name}`, passwordHash: 'x', name, role, locale }));
}
/** A phone / browser of `u`, as FCM knows it. */
async function device(u: User, token: string): Promise<void> {
  const repo = ds.getRepository(DeviceToken);
  await repo.save(repo.create({ token, userId: u.id, role: u.role, platform: 'android', app: 'web' }));
}
/** What FCM was asked to show on this device. */
const shown = (token: string) => fcm.find((m) => m.tokens.includes(token))?.notification;
const caller = (u: User) => ({ id: u.id, role: u.role, name: u.name });

function build(provider: TranslatorProvider) {
  tr = testTranslations(ds, provider);
  const push = new PushService(ds.getRepository(DeviceToken));
  (push as never as { messaging: unknown }).messaging = {
    sendEachForMulticast: async (m: (typeof fcm)[number]) => {
      fcm.push(m);
      return { successCount: m.tokens.length, responses: m.tokens.map(() => ({ success: true })) };
    },
  };
  const directory = new TeamDirectory(ds.getRepository(SellerTeamMember), ds.getRepository(Seller));
  notifications = new NotificationsService(ds.getRepository(Notification), emitter as never, push, ds.getRepository(User), tr, directory);
  const productsSvc = { names: async (ids: string[]) => new Map(ids.map((id) => [id, { name: 'Phone', nameFr: 'Téléphone' }])), publishUpdated: async () => undefined };
  reviews = new ReviewsService(
    ds.getRepository(Review),
    ds.getRepository(ProductQuestion),
    ds.getRepository(Product),
    ds.getRepository(Order),
    ds.getRepository(Seller),
    emitter as never,
    notifications,
    productsSvc as never,
    ds.getRepository(ReviewReport),
    ds.getRepository(ReviewHelpful),
    tr,
  );
  support = new SupportService(ds.getRepository(SupportTicket), ds.getRepository(SupportMessage), ds.getRepository(Order), ds.getRepository(User), notifications, emitter as never, tr);
}

/** A store owned by an `locale` seller, with one product and one phone. */
async function store(name: string, locale: 'en' | 'fr') {
  const owner = await user(name, 'seller', locale);
  const seller = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: `Shop ${name}`, userId: owner.id, status: 'approved' }));
  const product = await addProduct(ds, { sellerId: seller.id, name: 'Phone' });
  await device(owner, `tok-${name}`);
  return { owner, seller, product, token: `tok-${name}` };
}
async function delivered(customerId: string, productId: string) {
  const repo = ds.getRepository(Order);
  await repo.save(repo.create({ reference: `SOM-${Math.random()}`.slice(0, 18), customerId, customerName: 'x', status: 'delivered', totalUsd: 10, items: [{ productId, productName: 'Phone', variant: 'Default', qty: 1, priceUsd: 10 }] as OrderItem[] }));
}

const FR_QUESTION = 'Est-ce que ce produit est neuf ?';

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  fcm = [];
  fake = new FakeTranslator();
  build(fake);
});
afterEach(async () => ds.destroy());

describe('a question written in French', () => {
  it('an English-locale seller is pushed the English version, a French-locale seller the French one', async () => {
    const en = await store('alice', 'en');
    const fr = await store('bruno', 'fr');
    const asker = await user('client', 'customer', 'fr');
    await reviews.ask(caller(asker), { productId: en.product.id, question: FR_QUESTION });
    await reviews.ask(caller(asker), { productId: fr.product.id, question: FR_QUESTION });
    await settle();
    expect(shown(en.token)).toEqual({ title: 'New question on your product', body: `Phone: [en] ${FR_QUESTION}` });
    expect(shown(fr.token)).toEqual({ title: 'Nouvelle question sur votre produit', body: `Téléphone: ${FR_QUESTION}` });
  });

  it('the bell (NoticeView) carries both: body in English, bodyFr in French', async () => {
    const en = await store('alice', 'en');
    const asker = await user('client', 'customer', 'fr');
    await reviews.ask(caller(asker), { productId: en.product.id, question: FR_QUESTION });
    const [view] = await notifications.listForUser(en.owner.id, 'seller');
    expect(view).toMatchObject({ title: 'New question on your product', body: `Phone: [en] ${FR_QUESTION}`, titleFr: 'Nouvelle question sur votre produit', bodyFr: `Téléphone: ${FR_QUESTION}` });
    // and the live copy that is emitted when the notice is created
    const live = emitter.sent.find((e) => e.event === 'notification:new' && e.to === `user:${en.owner.id}`)!.payload;
    expect(live).toMatchObject({ body: `Phone: [en] ${FR_QUESTION}`, bodyFr: `Téléphone: ${FR_QUESTION}` });
  });

  it('translation off: both sellers are pushed the original, each with their own title', async () => {
    build(off);
    const en = await store('alice', 'en');
    const fr = await store('bruno', 'fr');
    const asker = await user('client', 'customer', 'fr');
    await reviews.ask(caller(asker), { productId: en.product.id, question: FR_QUESTION });
    await reviews.ask(caller(asker), { productId: fr.product.id, question: FR_QUESTION });
    await settle();
    expect(shown(en.token)?.body).toBe(`Phone: ${FR_QUESTION}`);
    expect(shown(fr.token)?.body).toBe(`Téléphone: ${FR_QUESTION}`);
    expect(shown(fr.token)?.title).toBe('Nouvelle question sur votre produit');
  });

  it('the answer, written in English, reaches the French-locale asker in French', async () => {
    const en = await store('alice', 'en');
    const asker = await user('client', 'customer', 'fr');
    await device(asker, 'tok-client');
    const q = await reviews.ask(caller(asker), { productId: en.product.id, question: FR_QUESTION });
    await reviews.answer(q.id, 'Yes, it is brand new', en.owner.name);
    await settle();
    expect(shown('tok-client')).toEqual({ title: 'Votre question a reçu une réponse', body: 'Téléphone: [fr] Yes, it is brand new' });
  });
});

describe('a review written in English', () => {
  it('a French-locale seller is pushed the French version, an English-locale seller the original', async () => {
    const en = await store('alice', 'en');
    const fr = await store('bruno', 'fr');
    const buyer = await user('client', 'customer', 'en');
    await delivered(buyer.id, en.product.id);
    await delivered(buyer.id, fr.product.id);
    await reviews.create(caller(buyer), { productId: en.product.id, rating: 5, text: 'Great phone, fast delivery' });
    await reviews.create(caller(buyer), { productId: fr.product.id, rating: 5, text: 'Great phone, fast delivery' });
    await settle();
    expect(shown(en.token)?.body).toBe('Phone: 5★ Great phone, fast delivery');
    expect(shown(fr.token)?.body).toBe('Téléphone: 5★ [fr] Great phone, fast delivery');
    expect(shown(fr.token)?.title).toBe('Nouvel avis sur votre produit');
  });

  it('the seller’s reply reaches a French-locale reviewer in French', async () => {
    const en = await store('alice', 'en');
    const buyer = await user('client', 'customer', 'fr');
    await device(buyer, 'tok-client');
    await delivered(buyer.id, en.product.id);
    const r = await reviews.create(caller(buyer), { productId: en.product.id, rating: 4, text: 'Très bon produit, livraison rapide' });
    await reviews.reply(caller(en.owner), r.id, 'Thank you for your review');
    await settle();
    expect(shown('tok-client')?.body).toBe('Téléphone: [fr] Thank you for your review');
  });
});

describe('a support message', () => {
  it('the agents (a role broadcast, web push) are pushed per device language', async () => {
    const agentEn = await user('agentEn', 'admin_support', 'en');
    const agentFr = await user('agentFr', 'admin_support', 'fr');
    await device(agentEn, 'tok-agent-en');
    await device(agentFr, 'tok-agent-fr');
    const customer = await user('client', 'customer', 'fr');
    const t = await support.open(caller(customer), { subject: 'Livraison très lente', message: 'Ma commande est en retard pour la livraison' });
    await settle();
    // the new-ticket notice quotes the subject
    expect(shown('tok-agent-en')).toEqual({ title: 'New support ticket', body: `${t.reference} · [en] Livraison très lente` });
    expect(shown('tok-agent-fr')).toEqual({ title: 'Nouveau ticket d’assistance', body: `${t.reference} · Livraison très lente` });
    // a follow-up from the customer in French, nobody assigned: role notice to admin_support
    fcm.length = 0;
    await support.reply(t.id, caller(customer), 'Toujours rien reçu, merci de vérifier');
    await settle();
    expect(shown('tok-agent-en')?.body).toBe(`${t.reference} · client: [en] Toujours rien reçu, merci de vérifier`);
    expect(shown('tok-agent-fr')?.body).toBe(`${t.reference} · client: Toujours rien reçu, merci de vérifier`);
  });

  it('the agent’s English reply reaches a French-locale customer in French; with translation off, as written', async () => {
    const agent = await user('agent', 'admin_support', 'en');
    const customer = await user('client', 'customer', 'fr');
    await device(customer, 'tok-client');
    const t = await support.open(caller(customer), { subject: 'Livraison très lente', message: 'Ma commande est en retard pour la livraison' });
    fcm.length = 0;
    await support.reply(t.id, caller(agent), 'We are checking with the carrier');
    await settle();
    expect(shown('tok-client')?.body).toBe(`${t.reference}: [fr] We are checking with the carrier`);
    build(off);
    fcm.length = 0;
    await support.reply(t.id, caller(agent), 'Any news from the carrier?');
    await settle();
    expect(shown('tok-client')?.body).toBe(`${t.reference}: Any news from the carrier?`);
  });
});
