import { DataSource } from 'typeorm';
import { Category, Product, Translation, TranslationJob } from '../database/entities';
import { CategoriesService } from '../catalog/categories.service';
import { addProduct, recordingEmitter, testDb, testTranslations } from '../testing/test-db';
import { FakeTranslator } from './fake.translator';
import type { TranslationService } from './translation.service';
import type { TranslatorProvider } from './translator.provider';

/**
 * Authored platform content is translated BEFORE it is published: the save waits for the job (bounded by
 * TRANSLATE_SAVE_TIMEOUT_MS), so the first `…:created` / `…:updated` already carries both languages.
 */

let ds: DataSource;
let svc: TranslationService;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rowsOf = (id: string) => ds.getRepository(Translation).find({ where: { entityId: id }, order: { field: 'ASC', locale: 'ASC' } });
const jobOf = (id: string) => ds.getRepository(TranslationJob).findOne({ where: { entityId: id } });
/** Polls until `fn` answers something truthy (the machine under test may be busy: no fixed sleeps). */
const until = async <T>(fn: () => Promise<T | null | false | undefined>, ms = 10_000): Promise<T> => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await sleep(25);
  }
};
/** A translator that answers only when the test says so (`release()`): a slow provider without any timing in the test. */
const gated = () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const inner = new FakeTranslator();
  const provider: TranslatorProvider = { name: 'fake', enabled: true, translate: async (t, f, to) => (await gate, inner.translate(t, f, to)), detect: async (t, to) => (await gate, inner.detect(t, to)) };
  return { provider, release };
};
const broken: TranslatorProvider = { name: 'fake', enabled: true, translate: async () => { throw new Error('Cloud Translation 503'); }, detect: async () => { throw new Error('Cloud Translation 503'); } };

beforeEach(async () => {
  ds = await testDb();
});
afterEach(async () => {
  delete process.env.TRANSLATE_SAVE_TIMEOUT_MS;
  await ds.destroy();
});

describe('enqueue waits for the job', () => {
  it('runs the job inline: the machine rows exist and the job is done when the call returns', async () => {
    svc = testTranslations(ds);
    svc.autoRun = true;
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    expect((await rowsOf(p.id)).map((r) => [r.field, r.locale, r.value])).toEqual([['name', 'fr', '[fr] Wireless Earbuds']]);
    expect((await jobOf(p.id))?.status).toBe('done');
  });

  it('autoRun off (tests): the job is only queued', async () => {
    svc = testTranslations(ds);
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    expect(await rowsOf(p.id)).toHaveLength(0);
    expect((await jobOf(p.id))?.status).toBe('pending');
  });

  it('wait: false only queues it (admin retry): it runs a moment later', async () => {
    svc = testTranslations(ds);
    svc.autoRun = true;
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id, { wait: false });
    expect(await rowsOf(p.id)).toHaveLength(0);
    await until(async () => (await rowsOf(p.id)).length === 1);
  });

  it('a timeout lets the job carry on in the background: the save returns early, the job finishes later and republishes', async () => {
    process.env.TRANSLATE_SAVE_TIMEOUT_MS = '40'; // read at call time
    const slow = gated();
    svc = testTranslations(ds, slow.provider);
    svc.autoRun = true;
    const republished: string[] = [];
    svc.registerRepublisher('product', async (id) => void republished.push(id));
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id); // returns after the timeout: the provider is still blocked
    expect(await rowsOf(p.id)).toHaveLength(0);
    expect((await jobOf(p.id))?.status).toBe('pending');
    expect(republished).toEqual([]);
    slow.release();
    await until(async () => (await jobOf(p.id))?.status === 'done');
    await until(async () => republished.length > 0);
    expect((await rowsOf(p.id)).map((r) => r.locale)).toEqual(['fr']);
    expect(republished).toEqual([p.id]); // the first publish had no French: the finished job publishes the record again
  });

  it('a job that finishes inside the wait does not republish: the waiting save publishes the record itself', async () => {
    svc = testTranslations(ds);
    svc.autoRun = true;
    const republished: string[] = [];
    svc.registerRepublisher('product', async (id) => void republished.push(id));
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    await sleep(100);
    expect(republished).toEqual([]);
    expect(await rowsOf(p.id)).toHaveLength(1);
  });

  it('never throws: a failing translator leaves the job pending for the sweeper', async () => {
    svc = testTranslations(ds, broken);
    svc.autoRun = true;
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await expect(svc.enqueue('product', p.id)).resolves.toBeUndefined();
    const job = await jobOf(p.id);
    expect(job).toMatchObject({ status: 'pending', attempts: 1 });
    expect(job?.lastError).toContain('503');
  });

  it('translation off: nothing is queued and nothing waits', async () => {
    svc = testTranslations(ds, { name: 'off', enabled: false, translate: async (t) => t, detect: async (t) => t.map((text) => ({ text, sourceLang: 'und' })) } as never);
    svc.autoRun = true;
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    await svc.enqueue('product', p.id);
    expect(await jobOf(p.id)).toBeNull();
  });

  it('a second save while the first job runs reruns once, and the second save waits for the rerun too', async () => {
    const slow = gated();
    svc = testTranslations(ds, slow.provider);
    svc.autoRun = true;
    const p = await addProduct(ds, { name: 'Wireless Earbuds' });
    const first = svc.enqueue('product', p.id);
    await sleep(20);
    await ds.getRepository(Product).update({ id: p.id }, { name: 'Wireless Earbuds Pro' });
    const second = svc.enqueue('product', p.id);
    slow.release();
    await Promise.all([first, second]);
    expect((await rowsOf(p.id)).map((r) => r.value)).toEqual(['[fr] Wireless Earbuds Pro']);
    expect((await jobOf(p.id))?.status).toBe('done');
  });
});

describe('the first publish carries both languages', () => {
  const build = (provider: TranslatorProvider) => {
    svc = testTranslations(ds, provider);
    svc.autoRun = true;
    const emitter = recordingEmitter();
    const cats = new CategoriesService(ds.getRepository(Category), ds.getRepository(Product), emitter as never, svc);
    return { cats, emitter };
  };

  it('a new category: the French name is in the returned record and in the first categories:updated', async () => {
    const { cats, emitter } = build(new FakeTranslator());
    const c = await cats.create({ name: 'Gadgets' });
    expect(c.nameFr).toBe('[fr] Gadgets');
    const first = emitter.sent.find((e) => e.event === 'categories:updated');
    expect((first?.payload as { id: string; nameFr: string }[]).find((x) => x.id === c.id)?.nameFr).toBe('[fr] Gadgets');
    expect(emitter.sent.filter((e) => e.event === 'categories:updated')).toHaveLength(1); // no second, redundant publish
  });

  it('a slow translator: the first publish goes out in one language, the finished job publishes again with both', async () => {
    process.env.TRANSLATE_SAVE_TIMEOUT_MS = '40';
    const slow = gated();
    const { cats, emitter } = build(slow.provider);
    const c = await cats.create({ name: 'Gadgets' });
    expect(c.nameFr).toBe('Gadgets');
    const pushes = () => emitter.sent.filter((e) => e.event === 'categories:updated');
    expect(pushes()).toHaveLength(1);
    slow.release();
    await until(async () => pushes().length >= 2);
    expect(pushes()).toHaveLength(2);
    expect((pushes()[1].payload as { id: string; nameFr: string }[]).find((x) => x.id === c.id)?.nameFr).toBe('[fr] Gadgets');
  });
});
