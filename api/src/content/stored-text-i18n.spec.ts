import { DataSource } from 'typeorm';
import { Order, OrderItem, Product, ProductQuestion, Review, ReviewHelpful, ReviewReport, Seller, Translation } from '../database/entities';
import { FakeTranslator } from '../translation/fake.translator';
import type { TranslationService } from '../translation/translation.service';
import type { TranslatorProvider } from '../translation/translator.provider';
import { addProduct, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { ReviewsService } from './reviews.service';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let fake: FakeTranslator;
let tr: TranslationService;
let svc: ReviewsService;
let s1: Seller;
let product: Product;

const customer = { id: 'c1', name: 'Marie Dupont' };
const sellerOne = { id: 'su1', name: 'Seller One', role: 'seller' };

function build(provider: TranslatorProvider) {
  tr = testTranslations(ds, provider);
  const notifications = { toUser: async () => undefined, toRole: async () => undefined };
  const productsSvc = { names: async (ids: string[]) => new Map(ids.map((id) => [id, { name: 'Phone', nameFr: 'Téléphone' }])), publishUpdated: async () => undefined };
  svc = new ReviewsService(
    ds.getRepository(Review),
    ds.getRepository(ProductQuestion),
    ds.getRepository(Product),
    ds.getRepository(Order),
    ds.getRepository(Seller),
    emitter as never,
    notifications as never,
    productsSvc as never,
    ds.getRepository(ReviewReport),
    ds.getRepository(ReviewHelpful),
    tr,
  );
}

async function delivered(userId = 'c1') {
  const repo = ds.getRepository(Order);
  return repo.save(repo.create({ reference: `SOM-${Math.random()}`.slice(0, 18), customerId: userId, customerName: 'x', status: 'delivered', totalUsd: 10, items: [{ productId: product.id, productName: 'Phone', variant: 'Default', qty: 1, priceUsd: 10 }] as OrderItem[] }));
}
const rowsOf = (id: string) => ds.getRepository(Translation).find({ where: { entityId: id }, order: { entityType: 'ASC', locale: 'ASC' } });
const sentTo = (event: string) => emitter.sent.filter((e) => e.event === event);
const broken: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('Cloud Translation 503'); }, detect: async () => { throw new Error('Cloud Translation 503'); } };

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  fake = new FakeTranslator();
  s1 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'One', userId: sellerOne.id, status: 'approved' }));
  product = await addProduct(ds, { name: 'Phone', sellerId: s1.id });
  build(fake);
});
afterEach(async () => ds.destroy());

describe('reviews: translated before they are stored', () => {
  it('stores the text and its French row, and returns and emits both languages', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 5, text: 'Great phone, fast delivery' });
    const expected = { sourceLang: 'en', en: 'Great phone, fast delivery', fr: '[fr] Great phone, fast delivery' };
    expect(r.text).toBe('Great phone, fast delivery');
    expect(r.textI18n).toEqual(expected);
    expect(r.replyI18n).toBeUndefined();
    expect((await rowsOf(r.id)).map((x) => [x.entityType, x.field, x.locale, x.origin])).toEqual([['review', 'text', 'fr', 'machine']]);
    const events = [...sentTo('review:created')];
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (const e of events) expect(e.payload.textI18n).toEqual(expected);
    // The row is saved with the translation: a list serves it without any provider call.
    fake.calls.length = 0;
    expect((await svc.listForProduct(product.id))[0].textI18n).toEqual(expected);
    expect(fake.calls).toHaveLength(0);
  });

  it('a French review gets English', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 5, text: 'Très bon produit, livraison rapide' });
    expect(r.textI18n).toEqual({ sourceLang: 'fr', fr: 'Très bon produit, livraison rapide', en: '[en] Très bon produit, livraison rapide' });
  });

  it('a failing translator still saves the review: no error, no i18n field', async () => {
    build(broken);
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 4, text: 'Great phone, fast delivery' });
    expect(r.id).toBeTruthy();
    expect('textI18n' in r).toBe(false);
    expect(await rowsOf(r.id)).toHaveLength(0);
    expect(await ds.getRepository(Review).count()).toBe(1);
    expect(sentTo('review:created').every((e) => !('textI18n' in e.payload))).toBe(true);
  });

  it('the seller reply is translated too (replyI18n), on the return and on every update event', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 5, text: 'Great phone, fast delivery' });
    const out = await svc.reply(sellerOne, r.id, 'Thank you very much');
    const reply = { sourceLang: 'en', en: 'Thank you very much', fr: '[fr] Thank you very much' };
    expect(out.replyI18n).toEqual(reply);
    expect(out.textI18n).toMatchObject({ sourceLang: 'en' });
    expect((await rowsOf(r.id)).map((x) => [x.entityType, x.field, x.locale])).toEqual([['review', 'text', 'fr'], ['review_reply', 'reply', 'fr']]);
    const upd = sentTo('review:updated');
    expect(upd.length).toBeGreaterThanOrEqual(3);
    for (const e of upd) expect(e.payload.replyI18n).toEqual(reply);
  });

  it('editing the reply translates again: the new text is served, the old translation is not', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 5, text: 'Great phone, fast delivery' });
    await svc.reply(sellerOne, r.id, 'Thank you very much');
    const out = await svc.reply(sellerOne, r.id, 'Merci beaucoup pour votre avis');
    expect(out.replyI18n).toEqual({ sourceLang: 'fr', fr: 'Merci beaucoup pour votre avis', en: '[en] Merci beaucoup pour votre avis' });
    const reply = (await rowsOf(r.id)).filter((x) => x.entityType === 'review_reply');
    expect(reply.map((x) => [x.locale, x.value])).toEqual([['en', '[en] Merci beaucoup pour votre avis']]);
  });

  it('a reply the translator could not translate drops the stale translation of the old reply', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 5, text: 'Great phone, fast delivery' });
    await svc.reply(sellerOne, r.id, 'Thank you very much');
    build(broken);
    const out = await svc.reply(sellerOne, r.id, 'Thanks again');
    expect(out.sellerReply).toBe('Thanks again');
    expect('replyI18n' in out).toBe(false);
    expect((await svc.listForProduct(product.id))[0].replyI18n).toBeUndefined();
  });

  it('every list carries the fields: product, seller, moderation; one lookup per kind', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 5, text: 'Great phone, fast delivery' });
    await svc.reply(sellerOne, r.id, 'Thank you very much');
    const spy = jest.spyOn(ds.getRepository(Translation), 'find');
    const lists = [await svc.listForProduct(product.id), await svc.listForSeller([s1.id]), await svc.listForModeration({})];
    expect(spy).toHaveBeenCalledTimes(3 * 2);
    for (const l of lists) {
      expect(l).toHaveLength(1);
      expect(l[0].textI18n?.fr).toBe('[fr] Great phone, fast delivery');
      expect(l[0].replyI18n?.fr).toBe('[fr] Thank you very much');
    }
  });

  it('hiding a review: shoppers still get only {id, productId, status}; staff get the row with its i18n', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 5, text: 'Great phone, fast delivery' });
    await svc.setStatus(r.id, 'hidden', 'spam');
    const upd = emitter.sent.filter((e) => e.event === 'review:updated');
    expect(upd.find((e) => e.to === 'customer,guest')?.payload).toEqual({ id: r.id, productId: product.id, status: 'hidden' });
    expect(upd.find((e) => e.to.includes('admin'))?.payload.textI18n?.fr).toBe('[fr] Great phone, fast delivery');
  });
});

describe('questions and answers', () => {
  it('a question is stored with its translation; the public shape adds only the i18n field', async () => {
    const q = await svc.ask(customer, { productId: product.id, question: 'Does it come with a charger?' });
    const expected = { sourceLang: 'en', en: 'Does it come with a charger?', fr: '[fr] Does it come with a charger?' };
    expect(q.questionI18n).toEqual(expected);
    expect('answerI18n' in q).toBe(false);
    expect((await rowsOf(q.id)).map((x) => [x.entityType, x.field, x.locale])).toEqual([['question', 'text', 'fr']]);
    const shoppers = sentTo('question:created').find((e) => e.to === 'customer')!.payload;
    expect(shoppers.questionI18n).toEqual(expected);
    expect(shoppers.askedBy).toBe('Marie'); // first name only
    expect('askerId' in shoppers).toBe(false);
    expect('sellerId' in shoppers).toBe(false);
    expect(sentTo('question:created').find((e) => e.to.includes('admin'))?.payload.questionI18n).toEqual(expected);
    expect(sentTo('question:created').find((e) => e.to === 'user:su1')?.payload.questionI18n).toEqual(expected);
  });

  it('an answer is stored with its translation (answerI18n) next to the question on every update and list', async () => {
    const q = await svc.ask(customer, { productId: product.id, question: 'Does it come with a charger?' });
    const a = await svc.answer(q.id, 'Oui, un chargeur est inclus', 'Seller One');
    const answer = { sourceLang: 'fr', fr: 'Oui, un chargeur est inclus', en: '[en] Oui, un chargeur est inclus' };
    expect(a?.answerI18n).toEqual(answer);
    expect(a?.questionI18n?.fr).toBe('[fr] Does it come with a charger?');
    expect((await rowsOf(q.id)).map((x) => [x.entityType, x.locale])).toEqual([['answer', 'en'], ['question', 'fr']]);
    const upd = sentTo('question:updated');
    expect(upd.length).toBeGreaterThanOrEqual(3);
    for (const e of upd) expect(e.payload.answerI18n).toEqual(answer);
    const pub = await svc.listQuestions(product.id);
    expect(pub[0]).toMatchObject({ questionI18n: { sourceLang: 'en' }, answerI18n: answer });
    expect('askerId' in pub[0]).toBe(false);
    const inbox = await svc.listQuestionsForSeller([s1.id]);
    expect(inbox[0]).toMatchObject({ questionI18n: { sourceLang: 'en' }, answerI18n: answer, productName: 'Phone' });
  });

  it('editing an answer translates again', async () => {
    const q = await svc.ask(customer, { productId: product.id, question: 'Does it come with a charger?' });
    await svc.answer(q.id, 'Oui, un chargeur est inclus', 'Seller One');
    const a = await svc.answer(q.id, 'Yes, a charger is included', 'Seller One');
    expect(a?.answerI18n).toEqual({ sourceLang: 'en', en: 'Yes, a charger is included', fr: '[fr] Yes, a charger is included' });
    expect((await rowsOf(q.id)).filter((x) => x.entityType === 'answer').map((x) => [x.locale, x.value])).toEqual([['fr', '[fr] Yes, a charger is included']]);
  });

  it('the unanswered question has no answerI18n; a missing id costs the translator nothing', async () => {
    const q = await svc.ask(customer, { productId: product.id, question: 'Does it come with a charger?' });
    expect((await svc.listQuestions(product.id))[0].answerI18n).toBeUndefined();
    fake.calls.length = 0;
    expect(await svc.answer('00000000-0000-4000-8000-000000000000', 'Hello there', 'x')).toBeNull();
    expect(fake.calls).toHaveLength(0);
    expect(q.id).toBeTruthy();
  });

  it('a failing translator still saves both: no error, no i18n fields', async () => {
    build(broken);
    const q = await svc.ask(customer, { productId: product.id, question: 'Does it come with a charger?' });
    expect('questionI18n' in q).toBe(false);
    const a = await svc.answer(q.id, 'Yes, a charger is included', 'Seller One');
    expect(a?.answer).toBe('Yes, a charger is included');
    expect('answerI18n' in a!).toBe(false);
    const pub = await svc.listQuestions(product.id);
    expect(pub[0].answer).toBe('Yes, a charger is included');
    expect('questionI18n' in pub[0]).toBe(false);
    expect(await rowsOf(q.id)).toHaveLength(0);
  });
});
