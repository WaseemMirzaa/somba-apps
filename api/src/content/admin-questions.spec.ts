import { DataSource } from 'typeorm';
import { Order, Product, ProductQuestion, Review, ReviewHelpful, ReviewReport, Seller } from '../database/entities';
import { addProduct, recordingEmitter, testDb } from '../testing/test-db';
import { EngagementGateway } from './engagement.gateway';
import { foldSearch, matchesQuery, ReviewsService } from './reviews.service';

let ds: DataSource;
let svc: ReviewsService;
let gw: EngagementGateway;
let s1: Seller;
let s2: Seller;
let phone: Product;
let cable: Product;

const customer = { id: 'c1', name: 'Marie Kabongo' };
const other = { id: 'c2', name: 'Paul Mukendi' };
const client = (role: string) => ({ data: { user: { id: `u-${role}`, name: role, role } } }) as never;

beforeEach(async () => {
  ds = await testDb();
  s1 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Boutique Électro', userId: 'su1', status: 'approved' }));
  s2 = await ds.getRepository(Seller).save(ds.getRepository(Seller).create({ name: 'Cable House', userId: 'su2', status: 'approved' }));
  phone = await addProduct(ds, { name: 'Phone', sellerId: s1.id });
  cable = await addProduct(ds, { name: 'Cable', sellerId: s2.id });
  const names: Record<string, { name: string; nameFr: string }> = {
    [phone.id]: { name: 'Phone', nameFr: 'Téléphone' },
    [cable.id]: { name: 'Cable', nameFr: 'Câble' },
  };
  const notifications = { toUser: async () => undefined, toRole: async () => undefined };
  const productsSvc = { names: async (ids: string[]) => new Map(ids.map((id) => [id, names[id]])), publishUpdated: async () => undefined };
  svc = new ReviewsService(
    ds.getRepository(Review), ds.getRepository(ProductQuestion), ds.getRepository(Product), ds.getRepository(Order), ds.getRepository(Seller),
    recordingEmitter() as never, notifications as never, productsSvc as never, ds.getRepository(ReviewReport), ds.getRepository(ReviewHelpful),
  );
  gw = new EngagementGateway(svc, { record: async () => undefined } as never);
});
afterEach(async () => ds.destroy());

describe('search helpers', () => {
  it('fold accents and case and never throw on null', () => {
    expect(foldSearch('Électronique Cœur')).toBe('electronique coeur');
    expect(foldSearch(null)).toBe('');
    expect(matchesQuery('telephone', ['Téléphone', null, undefined])).toBe(true);
    expect(matchesQuery('   ', [null])).toBe(true);
    expect(matchesQuery('zzz', [null, undefined])).toBe(false);
  });
});

describe('questions:adminList / adminGet service', () => {
  beforeEach(async () => {
    await svc.ask(customer, { productId: phone.id, question: 'Is it waterproof?' });
    const q2 = await svc.ask(other, { productId: cable.id, question: 'Quelle est la longueur ?' });
    await svc.answer(q2.id, 'Deux mètres.', 'Cable House');
  });

  it('filters by status, store and product', async () => {
    expect((await svc.adminList({})).total).toBe(2);
    expect((await svc.adminList({ status: 'unanswered' })).items.map((x) => x.productName)).toEqual(['Phone']);
    expect((await svc.adminList({ status: 'answered' })).items.map((x) => x.productName)).toEqual(['Cable']);
    expect((await svc.adminList({ sellerId: s2.id })).items).toHaveLength(1);
    expect((await svc.adminList({ productId: phone.id })).items[0]).toMatchObject({ storeName: 'Boutique Électro', productNameFr: 'Téléphone', status: 'unanswered' });
  });

  it('searches question, answer, product (EN and FR), store and customer, accent-insensitive', async () => {
    for (const q of ['waterproof', 'metres', 'longueur', 'telephone', 'cable', 'electro', 'kabongo', 'PAUL']) {
      expect((await svc.adminList({ q })).total).toBeGreaterThan(0);
    }
    expect((await svc.adminList({ q: 'câble deux' })).total).toBe(1);
    expect((await svc.adminList({ q: 'nothing matches this' })).items).toEqual([]);
  });

  it('also searches the stored translations of the question and the answer', async () => {
    const [row] = (await svc.adminList({ productId: phone.id })).items;
    const asSvc = svc as unknown as { translations: unknown };
    asSvc.translations = { i18nFor: async (kind: string, rows: { id: string }[]) => new Map(kind === 'question' ? rows.map((r) => [r.id, { sourceLang: 'en', en: 'Is it waterproof?', fr: 'Est-il étanche ?' }]) : []) };
    expect((await svc.adminList({ q: 'etanche' })).items.map((x) => x.id)).toContain(row.id);
  });

  it('survives null and missing fields (old rows without a store, asker or product)', async () => {
    const repo = ds.getRepository(ProductQuestion);
    await repo.save(repo.create({ productId: 'gone-product', askedBy: '', askerId: null, sellerId: null, question: 'Orphan question' }));
    const res = await svc.adminList({ q: 'orphan' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ productName: '', storeName: '', customerName: '' });
    expect((await svc.adminList({ q: 'anything' })).total).toBe(0);
    expect((await svc.adminList({ q: 123, status: {}, cursor: 'x' } as never)).total).toBe(3);
  });

  it('pages by cursor, with and without a search', async () => {
    const repo = ds.getRepository(ProductQuestion);
    for (let i = 0; i < 5; i++) await repo.save(repo.create({ productId: phone.id, askedBy: 'Jean', sellerId: s1.id, question: `Extra number ${i}` }));
    const p1 = await svc.adminList({ limit: 3 });
    expect(p1).toMatchObject({ total: 7, nextCursor: '3' });
    const p2 = await svc.adminList({ limit: 3, cursor: p1.nextCursor });
    const p3 = await svc.adminList({ limit: 3, cursor: p2.nextCursor });
    expect(p3.nextCursor).toBeNull();
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((x) => x.id)).size).toBe(7);
    const s = await svc.adminList({ q: 'extra', limit: 2 });
    expect(s).toMatchObject({ total: 5, nextCursor: '2' });
    expect((await svc.adminList({ q: 'extra', limit: 2, cursor: '4' })).nextCursor).toBeNull();
  });

  it('adminGet returns one question with the first name only, and rejects an unknown id', async () => {
    const [row] = (await svc.adminList({ productId: phone.id })).items;
    const one = await svc.adminGet(row.id);
    expect(one).toMatchObject({ id: row.id, customerName: 'Marie', askedBy: 'Marie', storeName: 'Boutique Électro', productName: 'Phone' });
    await expect(svc.adminGet('nope')).rejects.toThrow('Question not found.');
    await expect(svc.adminGet(undefined)).rejects.toThrow('Question not found.');
  });
});

describe('questions:adminList / adminGet roles', () => {
  it.each(['admin', 'admin_operations', 'admin_moderation', 'admin_support'])('%s reads', async (role) => {
    const q = await svc.ask(customer, { productId: phone.id, question: 'Is it waterproof?' });
    const list = await gw.adminList(client(role), { status: 'all' });
    expect(list).toMatchObject({ ok: true });
    const got = await gw.adminGet(client(role), { id: q.id });
    expect(JSON.stringify(got)).toContain('waterproof');
  });

  it.each(['seller', 'customer', 'admin_finance', 'admin_marketing', 'guest', 'rider'])('%s is refused', async (role) => {
    const q = await svc.ask(customer, { productId: phone.id, question: 'Is it waterproof?' });
    expect(JSON.stringify(await gw.adminList(client(role), {}))).toMatch(/Not allowed|Sign in/);
    expect(JSON.stringify(await gw.adminGet(client(role), { id: q.id }))).toMatch(/Not allowed|Sign in/);
  });

  it('support reads but may not answer; moderation answers', async () => {
    const q = await svc.ask(customer, { productId: phone.id, question: 'Is it waterproof?' });
    expect(JSON.stringify(await gw.answer(client('admin_support'), { id: q.id, answer: 'Yes.' }))).toContain('Not allowed');
    expect(JSON.stringify(await gw.answer(client('admin_moderation'), { id: q.id, answer: 'Yes, IP67.' }))).toContain('IP67');
  });
});
