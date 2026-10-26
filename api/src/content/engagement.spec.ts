import { DataSource } from 'typeorm';
import { Order, OrderItem, Product, ProductQuestion, Review, ReviewHelpful, ReviewReport, Seller } from '../database/entities';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { ReviewsService } from './reviews.service';

let ds: DataSource;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; title: string; body: string; type?: string; entityId?: string }[];
let svc: ReviewsService;
let s1: Seller;
let s2: Seller;
let product: Product;

const customer = { id: 'c1', name: 'Marie' };
const other = { id: 'c2', name: 'Paul' };
const sellerOne = { id: 'su1', name: 'Seller One', role: 'seller' };
const sellerTwo = { id: 'su2', name: 'Seller Two', role: 'seller' };

async function delivered(userId = 'c1') {
  const repo = ds.getRepository(Order);
  return repo.save(repo.create({ reference: `SOM-${Math.random()}`.slice(0, 18), customerId: userId, customerName: 'x', status: 'delivered', totalUsd: 10, items: [{ productId: product.id, productName: 'Phone', variant: 'Default', qty: 1, priceUsd: 10 }] as OrderItem[] }));
}

beforeEach(async () => {
  ds = await testDb();
  emitter = recordingEmitter();
  notices = [];
  s1 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'One', userId: sellerOne.id, status: 'approved' }));
  s2 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Two', userId: sellerTwo.id, status: 'approved' }));
  product = await addProduct(ds, { name: 'Phone', sellerId: s1.id, image: 'http://x/p.png' });
  const notifications = {
    toUser: async (to: string, n: { title: string; body: string }) => void notices.push({ to, ...n }),
    toRole: async (to: string, n: { title: string; body: string }) => void notices.push({ to: `role:${to}`, ...n }),
  };
  const productsSvc = {
    names: async (ids: string[]) => new Map(ids.map((id) => [id, { name: 'Phone', nameFr: 'Téléphone' }])),
    publishUpdated: async () => undefined,
  };
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
  );
});
afterEach(async () => ds.destroy());

const titles = (to: string) => notices.filter((n) => n.to === to).map((n) => n.title);
const events = (to: string, event: string) => emitter.sent.filter((e) => e.to === to && e.event === event);

describe('reviews reach the seller', () => {
  it('a new review: live push and a notice to the product’s seller, and to nobody else', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 2, text: 'Not great at all' });
    expect(events('user:su1', 'review:created')).toHaveLength(1);
    expect(notices).toContainEqual(expect.objectContaining({ to: 'su1', title: 'New review on your product', type: 'review', entityId: r.id, body: 'Phone: 2★ Not great at all' }));
    expect(notices.some((n) => n.to === 'su2')).toBe(false);
  });

  it('only a buyer reviews, once', async () => {
    await expect(svc.create(customer, { productId: product.id, rating: 5, text: 'Never bought it' })).rejects.toThrow('after it has been delivered');
    await delivered();
    await svc.create(customer, { productId: product.id, rating: 5, text: 'Great, thanks' });
    await expect(svc.create(customer, { productId: product.id, rating: 5, text: 'Great, again' })).rejects.toThrow('already reviewed');
  });
});

describe('reporting and moderating', () => {
  async function review() {
    await delivered();
    return svc.create(customer, { productId: product.id, rating: 1, text: 'This seller is a thief and a scam' });
  }

  it('a seller reports a review of their own product, once; moderators are told', async () => {
    const r = await review();
    await expect(svc.report(sellerOne, r.id, 'no')).rejects.toThrow('what is wrong');
    await expect(svc.report(sellerTwo, r.id, 'Not even my product')).rejects.toThrow('Review not found.');
    await expect(svc.report({ ...customer, role: 'customer' }, r.id, 'I wrote it myself')).rejects.toThrow('Review not found.');
    const rep = await svc.report(sellerOne, r.id, 'Abusive: calls us thieves');
    expect(rep).toMatchObject({ reviewId: r.id, reporterId: 'su1', status: 'open' });
    await expect(svc.report(sellerOne, r.id, 'Abusive: calls us thieves')).rejects.toThrow('already reported');
    expect(titles('role:admin_moderation')).toContain('Review reported');
    expect(emitter.sent.some((e) => e.event === 'review:reported' && e.to.includes('admin_moderation'))).toBe(true);
    expect((await svc.listForModeration({ reported: true }))[0]).toMatchObject({ id: r.id, reportCount: 1 });
    expect(await svc.listForModeration({ reported: true, status: 'hidden' })).toEqual([]);
    expect(await svc.listReports(r.id)).toHaveLength(1);
  });

  it('hiding tells the author and the seller with the reason; the reports close; restoring tells them again', async () => {
    const r = await review();
    await svc.report(sellerOne, r.id, 'Abusive: calls us thieves');
    const hidden = await svc.setStatus(r.id, 'hidden', 'Insults the seller');
    expect(hidden).toMatchObject({ status: 'hidden', moderationReason: 'Insults the seller', reportCount: 0 });
    expect(notices).toContainEqual(expect.objectContaining({ to: 'c1', title: 'Your review was hidden', body: 'Phone: Insults the seller' }));
    expect(titles('su1')).toContain('A review on your product was hidden');
    expect((await ds.getRepository(ReviewReport).find())[0].status).toBe('resolved');
    expect(events('user:c1', 'review:updated').length).toBeGreaterThan(0);
    await expect(svc.report(sellerOne, r.id, 'Abusive again please')).rejects.toThrow('already hidden');
    await svc.setStatus(r.id, 'visible');
    expect(titles('c1')).toContain('Your review is visible again');
    expect(titles('su1')).toContain('A review on your product is visible again');
    expect((await ds.getRepository(Review).findOneBy({ id: r.id }))!.moderationReason).toBeNull();
  });

  it('setting the status it already has tells nobody', async () => {
    const r = await review();
    const before = notices.length;
    await svc.setStatus(r.id, 'visible');
    expect(notices).toHaveLength(before);
  });

  it('works without a reason (the old moderation button)', async () => {
    const r = await review();
    expect((await svc.setStatus(r.id, 'hidden')).status).toBe('hidden');
    expect(notices.find((n) => n.title === 'Your review was hidden')?.body).toBe('Phone');
  });
});

describe('helpful votes', () => {
  it('count once per person', async () => {
    await delivered();
    const r = await svc.create(customer, { productId: product.id, rating: 5, text: 'Works perfectly' });
    const a = await svc.markHelpful(r.id, other.id);
    const b = await svc.markHelpful(r.id, other.id);
    const c = await svc.markHelpful(r.id, 'c3');
    expect([a.counted, b.counted, c.counted]).toEqual([true, false, true]);
    expect(c.helpful).toBe(2);
    expect(await ds.getRepository(ReviewHelpful).count()).toBe(2);
    await expect(svc.markHelpful('missing', other.id)).rejects.toThrow('Review not found.');
  });
});

describe('product questions', () => {
  it('asking tells the seller (live + notice) and the moderators, and remembers who and which store', async () => {
    const q = await svc.ask(customer, { productId: product.id, question: 'Does it come with a case?' });
    expect(q).toMatchObject({ askerId: 'c1', sellerId: s1.id, answer: null });
    expect(events('user:su1', 'question:created')).toHaveLength(1);
    expect(notices).toContainEqual(expect.objectContaining({ to: 'su1', title: 'New question on your product', type: 'question', entityId: q.id }));
    expect(titles('role:admin_moderation')).toContain('New product question');
    await expect(svc.ask(customer, { productId: product.id, question: 'a' })).rejects.toThrow('Write your question first');
  });

  it('the seller inbox: only their store, with the product, filtered by state, paged', async () => {
    const q1 = await svc.ask(customer, { productId: product.id, question: 'Does it come with a case?' });
    await svc.ask(other, { productId: product.id, question: 'Is it unlocked for any network?' });
    const elsewhere = await addProduct(ds, { name: 'Cable', sellerId: s2.id });
    await svc.ask(customer, { productId: elsewhere.id, question: 'How long is the cable?' });
    const inbox = await svc.listQuestionsForSeller([s1.id, 'su1']);
    expect(inbox).toHaveLength(2);
    expect(inbox[0]).toMatchObject({ productName: 'Phone', productNameFr: 'Téléphone', productImage: 'http://x/p.png' });
    expect(await svc.countUnanswered([s1.id])).toBe(2);
    await svc.answer(q1.id, 'Yes, a soft case is included.', 'Seller One');
    expect(await svc.countUnanswered([s1.id])).toBe(1);
    expect((await svc.listQuestionsForSeller([s1.id], { status: 'unanswered' })).map((x) => x.id)).not.toContain(q1.id);
    expect((await svc.listQuestionsForSeller([s1.id], { status: 'answered' })).map((x) => x.id)).toEqual([q1.id]);
    expect(await svc.listQuestionsForSeller([s1.id], { limit: 1 })).toHaveLength(1);
    expect(await svc.listQuestionsForSeller(['nobody'])).toEqual([]);
    expect(await svc.countUnanswered(['nobody'])).toBe(0);
  });

  it('answering pushes question:updated to the asker, the seller and shoppers, and gives the asker a notice that opens the product', async () => {
    const q = await svc.ask(customer, { productId: product.id, question: 'Does it come with a case?' });
    const done = await svc.answer(q.id, 'Yes, a soft case is included.', 'Seller One');
    expect(done).toMatchObject({ answer: 'Yes, a soft case is included.', answeredBy: 'Seller One' });
    expect(done!.answeredAt).toBeTruthy();
    expect(events('user:c1', 'question:updated')).toHaveLength(1);
    expect(events('user:su1', 'question:updated')).toHaveLength(1);
    expect(emitter.sent.some((e) => e.event === 'question:updated' && e.to.includes('customer') && e.to.includes('guest'))).toBe(true);
    expect(notices).toContainEqual(expect.objectContaining({ to: 'c1', title: 'Your question was answered', type: 'question', entityId: product.id }));
  });

  it('shoppers and guests only ever see the asker\'s first name, never an account id or store id (list and pushes)', async () => {
    const full = await ds.getRepository(ProductQuestion).save(ds.getRepository(ProductQuestion).create({ productId: product.id, askedBy: 'Marie Kabongo Ilunga', askerId: 'c1', sellerId: s1.id, question: 'Is it waterproof?' }));
    for (let i = 0; i < 4; i++) await ds.getRepository(ProductQuestion).save(ds.getRepository(ProductQuestion).create({ productId: product.id, askedBy: 'Jean Mukendi', askerId: 'c2', sellerId: s1.id, question: `Question number ${i}?` }));
    const all = await svc.listQuestions(product.id);
    expect(all).toHaveLength(5);
    for (const q of all) {
      expect(Object.keys(q).sort()).toEqual(['answer', 'answeredAt', 'answeredBy', 'askedBy', 'createdAt', 'id', 'productId', 'question']);
      expect(q.askedBy).not.toContain(' ');
    }
    expect(all.find((q) => q.id === full.id)!.askedBy).toBe('Marie');
    // Paging: limit and offset walk the same newest-first order without repeats.
    const p1 = await svc.listQuestions(product.id, { limit: 2 });
    const p2 = await svc.listQuestions(product.id, { limit: 2, offset: 2 });
    const p3 = await svc.listQuestions(product.id, { limit: 2, offset: 4 });
    expect([...p1, ...p2, ...p3].map((q) => q.id).sort()).toEqual(all.map((q) => q.id).sort());
    expect([p1.length, p2.length, p3.length]).toEqual([2, 2, 1]);
    // The pushes to customers and guests are the public view; admins and the store get the full row.
    emitter.sent.length = 0;
    const asked = await svc.ask(customer, { productId: product.id, question: 'Does it come with a case?' });
    await svc.answer(asked.id, 'Yes.', 'Seller One');
    const toShoppers = emitter.sent.filter((e) => (e.to === 'customer' || e.to === 'customer,guest') && e.event.startsWith('question:'));
    expect(toShoppers).toHaveLength(2);
    for (const e of toShoppers) {
      expect(e.payload).not.toHaveProperty('askerId');
      expect(e.payload).not.toHaveProperty('sellerId');
      expect((e.payload as { askedBy: string }).askedBy).not.toContain(' ');
    }
    expect(emitter.sent.some((e) => e.event === 'question:created' && e.to.includes('admin') && (e.payload as { askerId?: string }).askerId === 'c1')).toBe(true);
    expect(events('user:su1', 'question:created')).toHaveLength(1);
    expect((events('user:su1', 'question:created')[0].payload as { askerId?: string }).askerId).toBe('c1');
    expect(events('user:c1', 'question:updated')[0].payload).not.toHaveProperty('askerId');
  });

  it('a question asked before the asker was stored still gets answered, without a notice', async () => {
    const old = await ds.getRepository(ProductQuestion).save(ds.getRepository(ProductQuestion).create({ productId: product.id, askedBy: 'Someone', question: 'Old one, any news?' }));
    await svc.answer(old.id, 'Yes.', 'Seller One');
    expect(notices.some((n) => n.title === 'Your question was answered')).toBe(false);
    expect(await svc.answer('missing', 'x', 'y')).toBeNull();
  });
});
