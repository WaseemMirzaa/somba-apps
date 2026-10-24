import { DataSource } from 'typeorm';
import { Review, ProductQuestion, Product, Translation, TranslationJob } from '../database/entities';
import { addProduct, testDb, testTranslations } from '../testing/test-db';
import { FakeTranslator, OffTranslator } from './fake.translator';
import { BACKOFF_MINUTES, MAX_ATTEMPTS, TranslationService, chunk } from './translation.service';
import { sourceHash } from './translatable';
import type { TranslatorProvider } from './translator.provider';

let ds: DataSource;
let fake: FakeTranslator;
let svc: TranslationService;

beforeEach(async () => {
  ds = await testDb();
  fake = new FakeTranslator();
  svc = testTranslations(ds, fake);
});
afterEach(async () => ds.destroy());

const rowsOf = (id: string) => ds.getRepository(Translation).find({ where: { entityId: id }, order: { field: 'ASC', locale: 'ASC' } });
const jobOf = (id: string) => ds.getRepository(TranslationJob).findOne({ where: { entityId: id } });

describe('the job queue', () => {
  it('a save queues a job, running it writes the machine rows and marks it done', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds', description: 'Noise reduction.' });
    await svc.enqueue('product', p.id);
    expect((await jobOf(p.id))?.status).toBe('pending');
    expect(await svc.runJob('product', p.id)).toBe(true);
    expect((await jobOf(p.id))?.status).toBe('done');
    const rows = await rowsOf(p.id);
    expect(rows.map((r) => [r.field, r.locale, r.value, r.origin])).toEqual([
      ['description', 'fr', '[fr] Noise reduction.', 'machine'],
      ['name', 'fr', '[fr] Wireless Earbuds', 'machine'],
    ]);
    expect(rows[0].sourceHash).toBe(sourceHash('en', 'Noise reduction.'));
    expect(rows[0].sourceLang).toBe('en');
  });

  it('runs the job at once after the save (setImmediate), without anyone waiting for it', async () => {
    svc.autoRun = true;
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    await new Promise((r) => setTimeout(r, 400));
    expect((await rowsOf(p.id)).length).toBe(1);
    expect((await jobOf(p.id))?.status).toBe('done');
  });

  it('a French-source record gets English; the source stays in its own column', async () => {
    const p = await addProduct(ds, { name: 'Chaussures de sport', sourceLang: 'fr' });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    expect((await rowsOf(p.id)).map((r) => [r.field, r.locale, r.value])).toEqual([['name', 'en', '[en] Chaussures de sport']]);
    expect((await ds.getRepository(Product).findOneByOrFail({ id: p.id })).name).toBe('Chaussures de sport');
  });

  it('a failing translator retries with backoff 1 m, 5 m, 30 m, 2 h, 12 h, and the sixth failure ends the job', async () => {
    const boom: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('Cloud Translation 503'); }, detect: async () => [] };
    svc = testTranslations(ds, boom);
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    const expected: (number | null)[] = [...BACKOFF_MINUTES, null];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const before = Date.now();
      expect(await svc.runJob('product', p.id)).toBe(false);
      const job = (await jobOf(p.id))!;
      expect(job.attempts).toBe(i + 1);
      expect(job.lastError).toContain('503');
      if (expected[i] === null) {
        expect(job.status).toBe('failed');
        expect(job.nextAttemptAt).toBeNull();
      } else {
        expect(job.status).toBe('pending');
        const wait = (job.nextAttemptAt!.getTime() - before) / 60_000;
        expect(wait).toBeGreaterThan(expected[i]! - 0.1);
        expect(wait).toBeLessThan(expected[i]! + 0.1);
        // make it due again, as time passing would
        await ds.getRepository(TranslationJob).update({ id: job.id }, { nextAttemptAt: new Date(Date.now() - 1000) });
      }
    }
    expect(await rowsOf(p.id)).toEqual([]);
    // a failed job is not retried by the sweeper, but retry() puts it back
    expect(await svc.sweep()).toBe(0);
    svc = testTranslations(ds, fake); // the provider recovered
    expect(await svc.retry({ entityType: 'product', entityId: p.id })).toEqual({ queued: 1 });
    expect((await jobOf(p.id))).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await svc.runJob('product', p.id)).toBe(true);
  });

  it('the sweeper runs only due jobs', async () => {
    const a = await addProduct(ds, { name: 'Wireless Earbuds' });
    const b = await addProduct(ds, { name: 'Leather Wallet' });
    await svc.enqueue('product', a.id);
    await svc.enqueue('product', b.id);
    await ds.getRepository(TranslationJob).update({ entityId: b.id }, { nextAttemptAt: new Date(Date.now() + 3_600_000) });
    expect(await svc.sweep()).toBe(1);
    expect((await jobOf(a.id))?.status).toBe('done');
    expect((await jobOf(b.id))?.status).toBe('pending');
  });

  it('a record deleted meanwhile just drops its job', async () => {
    await svc.enqueue('product', '00000000-0000-4000-8000-000000000001');
    expect(await svc.runJob('product', '00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(await ds.getRepository(TranslationJob).count()).toBe(0);
  });

  it('re-queueing resets a finished or failed job; a save during a run runs it once more', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    await ds.getRepository(Product).update({ id: p.id }, { name: 'Wireless Earbuds Pro' });
    await svc.enqueue('product', p.id);
    expect((await jobOf(p.id))?.status).toBe('pending');
    await svc.runJob('product', p.id);
    expect((await rowsOf(p.id))[0].value).toBe('[fr] Wireless Earbuds Pro');
  });

  it('tells the owner of the record when a run wrote something (to re-emit it), and after a final failure', async () => {
    const seen: string[] = [];
    svc.registerRepublisher('product', async (id) => void seen.push(id));
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    expect(seen).toEqual([p.id]);
    // nothing new to write: no re-emit
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    expect(seen).toEqual([p.id]);
  });

  it('with translation off nothing is queued', async () => {
    svc = testTranslations(ds, new OffTranslator());
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    expect(await ds.getRepository(TranslationJob).count()).toBe(0);
    expect((await svc.present('product', [p])).get(p.id)?.translationStatus).toBe('off');
    expect(await svc.sweep()).toBe(0);
  });
});

describe('what is sent to the translator', () => {
  it('sends only text that carries language, and copies sizes, codes and numbers as they are', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds', description: '24 hours', variants: JSON.stringify([{ name: 'Size', options: ['XL', 'M'] }, { name: 'Storage', options: ['128GB', '256 GB'] }]) });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    const sent = fake.calls.flatMap((c) => c.texts).sort();
    expect(sent).toEqual(['24 hours', 'Size', 'Storage', 'Wireless Earbuds']);
    const variants = (await rowsOf(p.id)).find((r) => r.field === 'variants')!;
    expect(JSON.parse(variants.value)).toEqual([{ name: '[fr] Size', options: ['XL', 'M'] }, { name: '[fr] Storage', options: ['128GB', '256 GB'] }]);
  });

  it('one batched call per language pair covers every string of the record', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds', description: 'Noise reduction.', variants: JSON.stringify([{ name: 'Colour', options: ['Black', 'White'] }]) });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({ from: 'en', to: 'fr' });
    expect(fake.calls[0].texts).toHaveLength(5);
  });

  it('identical strings reuse one call: another record with the same title costs nothing', async () => {
    const a = await addProduct(ds, { name: 'Wireless Earbuds' });
    const b = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', a.id);
    await svc.runJob('product', a.id);
    expect(fake.calls).toHaveLength(1);
    await svc.enqueue('product', b.id);
    await svc.runJob('product', b.id);
    expect(fake.calls).toHaveLength(1);
    expect((await rowsOf(b.id))[0]).toMatchObject({ value: '[fr] Wireless Earbuds', origin: 'machine', sourceHash: sourceHash('en', 'Wireless Earbuds') });
  });

  it('a string already translated in this process ("Black") is not sent again for another product', async () => {
    const mk = (n: string) => addProduct(ds, { name: n, variants: JSON.stringify([{ name: 'Colour', options: ['Black'] }]) });
    const a = await mk('A Shirt');
    const b = await mk('B Shirt');
    await svc.enqueue('product', a.id);
    await svc.runJob('product', a.id);
    await svc.enqueue('product', b.id);
    await svc.runJob('product', b.id);
    expect(fake.calls[1].texts).toEqual(['B Shirt']);
  });
});

describe('C-I6: a machine never overwrites an author row', () => {
  it('runJob leaves the hand-written French alone and fills the rest', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds', description: 'Noise reduction.' });
    await ds.getRepository(Translation).insert({ entityType: 'product', entityId: p.id, field: 'name', locale: 'fr', value: 'Mes écouteurs', origin: 'author', sourceLang: 'en', sourceHash: sourceHash('en', 'Wireless Earbuds') });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    const rows = await rowsOf(p.id);
    expect(rows.find((r) => r.field === 'name')).toMatchObject({ value: 'Mes écouteurs', origin: 'author' });
    expect(rows.find((r) => r.field === 'description')).toMatchObject({ origin: 'machine' });
    expect(fake.calls.flatMap((c) => c.texts)).toEqual(['Noise reduction.']);
  });

  it('writeMachine refuses to replace an author or snapshot row, even when asked directly', async () => {
    const p = await addProduct(ds);
    const base = { entityType: 'product' as const, entityId: p.id, field: 'name', locale: 'fr', sourceLang: 'en', sourceHash: 'h' };
    await ds.getRepository(Translation).insert({ ...base, value: 'Auteur', origin: 'author' });
    expect(await svc.writeMachine('product', p.id, { field: 'name', locale: 'fr', value: 'Machine', sourceLang: 'en', sourceHash: 'h2' })).toBe(false);
    expect((await rowsOf(p.id))[0]).toMatchObject({ value: 'Auteur', origin: 'author' });
    await ds.getRepository(Translation).update({ entityId: p.id }, { origin: 'snapshot' });
    expect(await svc.writeMachine('product', p.id, { field: 'name', locale: 'fr', value: 'Machine', sourceLang: 'en', sourceHash: 'h2' })).toBe(false);
  });

  it('an existing machine row is updated in place when its source changed', async () => {
    const p = await addProduct(ds, { name: 'Old Title' });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    await ds.getRepository(Product).update({ id: p.id }, { name: 'New Title' });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    const rows = await rowsOf(p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ value: '[fr] New Title', sourceHash: sourceHash('en', 'New Title') });
  });

  it('retranslate() drops machine rows only', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds', description: 'Noise reduction.' });
    await ds.getRepository(Translation).insert({ entityType: 'product', entityId: p.id, field: 'name', locale: 'fr', value: 'Mes écouteurs', origin: 'author', sourceLang: 'en', sourceHash: null });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    await svc.retranslate('product', p.id);
    expect((await rowsOf(p.id)).map((r) => [r.field, r.origin])).toEqual([['name', 'author']]);
    expect((await jobOf(p.id))?.status).toBe('pending');
  });
});

describe('the daily budget', () => {
  it('over the limit a job stays pending (no attempt counted) until tomorrow', async () => {
    process.env.TRANSLATE_DAILY_CHAR_LIMIT = '20';
    try {
      svc = testTranslations(ds, fake);
    } finally {
      delete process.env.TRANSLATE_DAILY_CHAR_LIMIT;
    }
    expect(svc.charLimit).toBe(20);
    const p = await addProduct(ds, { name: 'A title that is longer than twenty characters' });
    await svc.enqueue('product', p.id);
    expect(await svc.runJob('product', p.id)).toBe(false);
    const job = (await jobOf(p.id))!;
    expect(job).toMatchObject({ status: 'pending', attempts: 0 });
    expect(job.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 60_000); // next UTC midnight
    expect(fake.calls).toHaveLength(0);
    expect(await svc.sweep()).toBe(0);
    expect((await svc.status()).charLimit).toBe(20);
  });

  it('counts the characters it sends, and status() reports them', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    const status = await svc.status();
    expect(status).toMatchObject({ provider: 'fake', enabled: true, pending: 0, done: 1, failed: 0, charsToday: 'Wireless Earbuds'.length });
  });

  it('after a restart the day\'s usage is rebuilt from the machine rows already written', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    const restarted = testTranslations(ds, fake);
    expect(await restarted.usedToday()).toBe('[fr] Wireless Earbuds'.length);
  });
});

describe('looking up translations', () => {
  it('never builds an IN list longer than 500 ids', async () => {
    const ids = Array.from({ length: 1203 }, (_, i) => `id-${i}`);
    expect(chunk(ids).map((c) => c.length)).toEqual([500, 500, 203]);
    const find = jest.spyOn(ds.getRepository(Translation), 'find');
    const jobsFind = jest.spyOn(ds.getRepository(TranslationJob), 'find');
    await svc.rowsFor('product', ids);
    await svc.jobsFor('product', ids);
    const sizes = (spy: jest.SpyInstance) => spy.mock.calls.map(([q]) => (q.where.entityId as { _value: string[] })._value.length);
    expect(sizes(find)).toEqual([500, 500, 203]);
    expect(sizes(jobsFind)).toEqual([500, 500, 203]);
  });
});

describe('present(): the composed words of a record', () => {
  it('serves name / nameFr, description / descriptionFr and the machine flags and state', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds', description: 'Noise reduction.' });
    let out = (await svc.present('product', [p])).get(p.id)!;
    expect(out.texts).toMatchObject({ name: 'Wireless Earbuds', nameFr: 'Wireless Earbuds', description: 'Noise reduction.', descriptionFr: 'Noise reduction.' });
    expect(out.translationStatus).toBe('pending'); // nothing translated yet and nobody queued it
    await svc.enqueue('product', p.id);
    expect((await svc.present('product', [p])).get(p.id)!.translationStatus).toBe('pending');
    await svc.runJob('product', p.id);
    out = (await svc.present('product', [p])).get(p.id)!;
    expect(out.texts).toMatchObject({ name: 'Wireless Earbuds', nameFr: '[fr] Wireless Earbuds', descriptionFr: '[fr] Noise reduction.' });
    expect(out.machineTranslated.sort()).toEqual(['descriptionFr', 'nameFr']);
    expect(out.translationStatus).toBe('done');
  });

  it('serves variantLabels.en / variantLabels.fr as machine-made names', async () => {
    const p = await addProduct(ds, { name: 'A1', variants: JSON.stringify([{ name: 'Colour', options: ['Black'] }]) });
    await svc.enqueue('product', p.id);
    await svc.runJob('product', p.id);
    const out = (await svc.present('product', [p])).get(p.id)!;
    expect(out.variantLabels).toEqual({ en: [{ name: 'Colour', options: ['Black'] }], fr: [{ name: '[fr] Colour', options: ['[fr] Black'] }] });
    expect(out.machineTranslated).toEqual(['variantLabels.fr']);
  });

  it('a failed job is reported as failed', async () => {
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await ds.getRepository(TranslationJob).insert({ entityType: 'product', entityId: p.id, status: 'failed', attempts: 6, nextAttemptAt: null, lastError: 'x' });
    expect((await svc.present('product', [p])).get(p.id)!.translationStatus).toBe('failed');
  });
});

describe('translate:text (translateStored): stored ids only (C-I5)', () => {
  const review = async (text: string, over: Partial<Review> = {}) =>
    ds.getRepository(Review).save(ds.getRepository(Review).create({ productId: 'p1', userId: 'u1', author: 'A', rating: 5, text, ...over }));

  it('translates a stored review and caches it as a translation row', async () => {
    const r = await review('Très bon produit');
    expect(await svc.translateStored('review', r.id, 'en')).toEqual({ text: '[en] Très bon produit', sourceLang: 'fr', same: false });
    expect(fake.calls).toHaveLength(1);
    expect(await svc.translateStored('review', r.id, 'en')).toEqual({ text: '[en] Très bon produit', sourceLang: 'fr', same: false });
    expect(fake.calls).toHaveLength(1); // served from the cache row
    expect((await ds.getRepository(Translation).findOneByOrFail({ entityType: 'review', entityId: r.id })).origin).toBe('machine');
  });

  it('text already in the target language comes back unchanged with same: true', async () => {
    const r = await review('Great product');
    expect(await svc.translateStored('review', r.id, 'en')).toEqual({ text: 'Great product', sourceLang: 'en', same: true });
  });

  it('translates a seller reply by the review id, and a question and its answer by the question id', async () => {
    const r = await review('Good', { sellerReply: 'Thank you' });
    expect((await svc.translateStored('review_reply', r.id, 'fr')).text).toBe('[fr] Thank you');
    const q = await ds.getRepository(ProductQuestion).save(ds.getRepository(ProductQuestion).create({ productId: 'p1', askedBy: 'A', question: 'Is it waterproof?', answer: 'Yes it is' }));
    expect((await svc.translateStored('question', q.id, 'fr')).text).toBe('[fr] Is it waterproof?');
    expect((await svc.translateStored('answer', q.id, 'fr')).text).toBe('[fr] Yes it is');
  });

  it('a changed reply is translated again (the cached row is stale)', async () => {
    const r = await review('Good', { sellerReply: 'Thank you' });
    await svc.translateStored('review_reply', r.id, 'fr');
    await ds.getRepository(Review).update({ id: r.id }, { sellerReply: 'Thanks a lot' });
    expect((await svc.translateStored('review_reply', r.id, 'fr')).text).toBe('[fr] Thanks a lot');
  });

  it('rejects ids that are not stored, free text, unknown kinds, other languages, empty text and hidden reviews', async () => {
    const hidden = await review('Secret', { status: 'hidden' });
    const empty = await ds.getRepository(Review).save(ds.getRepository(Review).create({ productId: 'p1', userId: 'u2', author: 'A', rating: 5, text: 'x' }));
    const nothing = 'Nothing to translate.';
    await expect(svc.translateStored('review', '00000000-0000-4000-8000-000000000000', 'fr')).rejects.toThrow(nothing);
    await expect(svc.translateStored('review', 'Translate this free text please', 'fr')).rejects.toThrow(nothing);
    await expect(svc.translateStored('review', undefined, 'fr')).rejects.toThrow(nothing);
    await expect(svc.translateStored('product', empty.id, 'fr')).rejects.toThrow(nothing);
    await expect(svc.translateStored('review_reply', empty.id, 'fr')).rejects.toThrow(nothing); // no reply stored
    await expect(svc.translateStored('review', hidden.id, 'fr')).rejects.toThrow(nothing);
    await expect(svc.translateStored('review', hidden.id, 'fr', { staff: true })).resolves.toMatchObject({ text: '[fr] Secret' });
    await expect(svc.translateStored('review', empty.id, 'de')).rejects.toThrow('Choose English or French.');
    expect(fake.calls.map((c) => c.texts[0])).toEqual(['Secret']); // nothing but stored text ever reached the translator
  });

  it('is unavailable (and calls nothing) when translation is off', async () => {
    svc = testTranslations(ds, new OffTranslator());
    const r = await review('Très bon produit');
    await expect(svc.translateStored('review', r.id, 'en')).rejects.toThrow('not available');
  });

  it('over the daily budget it says so instead of calling the translator', async () => {
    process.env.TRANSLATE_DAILY_CHAR_LIMIT = '5';
    svc = testTranslations(ds, fake);
    delete process.env.TRANSLATE_DAILY_CHAR_LIMIT;
    const r = await review('Très bon produit');
    await expect(svc.translateStored('review', r.id, 'en')).rejects.toThrow('not available');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('translateNow (synchronous, for broadcasts)', () => {
  it('translates what carries language and copies the rest', async () => {
    expect(await svc.translateNow(['Big sale', '50%'], 'en', 'fr')).toEqual(['[fr] Big sale', '50%']);
    expect(fake.calls[0].texts).toEqual(['Big sale']);
  });

  it('gives up after the timeout and answers null so the caller falls back to the source', async () => {
    const slow: TranslatorProvider = { name: 'fake', enabled: true, translate: () => new Promise(() => undefined), detect: async () => [] };
    svc = testTranslations(ds, slow);
    const started = Date.now();
    expect(await svc.translateNow(['Big sale'], 'en', 'fr', 50)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('answers null when off or when the provider fails', async () => {
    expect(await testTranslations(ds, new OffTranslator()).translateNow(['Big sale'], 'en', 'fr')).toBeNull();
    const boom: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('down'); }, detect: async () => [] };
    expect(await testTranslations(ds, boom).translateNow(['Big sale'], 'en', 'fr')).toBeNull();
  });
});

describe('admin: retry and backfill', () => {
  it('retry() with no argument re-queues every failed job', async () => {
    const a = await addProduct(ds, { name: 'Wireless Earbuds' });
    const b = await addProduct(ds, { name: 'Leather Wallet' });
    await ds.getRepository(TranslationJob).insert([
      { entityType: 'product', entityId: a.id, status: 'failed', attempts: 6, nextAttemptAt: null, lastError: 'x' },
      { entityType: 'product', entityId: b.id, status: 'done', attempts: 0, nextAttemptAt: null, lastError: null },
    ]);
    expect(await svc.retry()).toEqual({ queued: 1 });
    expect((await jobOf(a.id))?.status).toBe('pending');
    expect((await jobOf(b.id))?.status).toBe('done');
    await expect(svc.retry({ entityType: 'order', entityId: 'x' })).rejects.toThrow('Choose a record');
  });

  it('backfill dry run counts characters and the cost without queueing; a real run queues and drain() translates', async () => {
    await addProduct(ds, { name: 'Wireless Earbuds', description: 'Noise reduction.' });
    await addProduct(ds, { name: 'XL' }); // nothing to translate
    const dry = await svc.backfill({ dryRun: true });
    expect(dry).toMatchObject({ records: 1, items: 2, chars: 'Wireless Earbuds'.length + 'Noise reduction.'.length });
    expect(dry.estimatedUsd).toBeCloseTo((dry.chars / 1_000_000) * 20, 4);
    expect(await ds.getRepository(TranslationJob).count()).toBe(0);
    const real = await svc.backfill();
    expect(real.records).toBe(1);
    expect(await svc.drain()).toBe(1);
    expect((await svc.backfill({ dryRun: true })).records).toBe(0);
  });
});

describe('snapshots and author rows', () => {
  it('snapshot rows are written with the caller\'s manager (one transaction with the order)', async () => {
    await ds.transaction(async (m) => {
      await svc.snapshot(m, [{ entityId: 'item-1', field: 'productName', locale: 'fr', value: 'Écouteurs' }]);
    });
    expect(await ds.getRepository(Translation).findOneByOrFail({ entityType: 'order_item', entityId: 'item-1' })).toMatchObject({ origin: 'snapshot', locale: 'fr', value: 'Écouteurs' });
    await expect(
      ds.transaction(async (m) => {
        await svc.snapshot(m, [{ entityId: 'item-2', field: 'productName', locale: 'fr', value: 'X' }]);
        throw new Error('order failed');
      }),
    ).rejects.toThrow();
    expect(await ds.getRepository(Translation).count({ where: { entityId: 'item-2' } })).toBe(0);
  });
});
