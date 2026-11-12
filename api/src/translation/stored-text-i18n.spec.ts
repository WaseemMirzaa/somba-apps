import { DataSource } from 'typeorm';
import { Review, Translation } from '../database/entities';
import { testDb, testTranslations } from '../testing/test-db';
import { FakeTranslator, OffTranslator } from './fake.translator';
import { sourceHash } from './translatable';
import type { TranslationService } from './translation.service';
import type { Detected, TranslatorProvider } from './translator.provider';

let ds: DataSource;
let fake: FakeTranslator;
let svc: TranslationService;
const ENV_KEYS = ['TRANSLATE_SAVE_TIMEOUT_MS', 'TRANSLATE_DAILY_CHAR_LIMIT'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  ds = await testDb();
  fake = new FakeTranslator();
  svc = testTranslations(ds, fake);
});
afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await ds.destroy();
});

/** A provider that always recognises the source as `lang` (Urdu here) and records every call. */
function stub(lang: string, over: Partial<TranslatorProvider> = {}) {
  const calls: { kind: 'detect' | 'translate'; from: string | null; to: string }[] = [];
  const provider: TranslatorProvider = {
    name: 'fake',
    enabled: true,
    translate: async (texts, from, to) => {
      calls.push({ kind: 'translate', from, to });
      return texts.map((t) => `[${to}] ${t}`);
    },
    detect: async (texts, to): Promise<Detected[]> => {
      calls.push({ kind: 'detect', from: null, to });
      return texts.map((t) => ({ text: lang === to ? t : `[${to}] ${t}`, sourceLang: lang }));
    },
    ...over,
  };
  return { provider, calls };
}

describe('translateForSave', () => {
  it('an English text needs French only: one detect call, nothing else', async () => {
    const r = await svc.translateForSave('  Great phone, fast delivery  ');
    expect(r).toEqual({ sourceLang: 'en', others: { fr: '[fr] Great phone, fast delivery' }, sourceHash: sourceHash('en', 'Great phone, fast delivery') });
    expect(fake.calls).toEqual([{ texts: ['Great phone, fast delivery'], from: null, to: 'fr' }]);
  });

  it('a French text needs English only (first target French equals the source: one extra translate)', async () => {
    const r = await svc.translateForSave('Très bon produit, livraison rapide');
    expect(r?.sourceLang).toBe('fr');
    expect(r?.others).toEqual({ en: '[en] Très bon produit, livraison rapide' });
    expect(fake.calls.map((c) => [c.from, c.to])).toEqual([[null, 'fr'], ['fr', 'en']]);
  });

  it('the sender language as a hint saves that call: a French sender is detected into English at once', async () => {
    const r = await svc.translateForSave('Très bon produit, livraison rapide', 'fr');
    expect(r?.others).toEqual({ en: '[en] Très bon produit, livraison rapide' });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].to).toBe('en');
  });

  it('a text in neither language needs both: detect into French, then one translate into English', async () => {
    const { provider, calls } = stub('ur');
    svc = testTranslations(ds, provider);
    const r = await svc.translateForSave('بہت اچھا فون');
    expect(r?.sourceLang).toBe('ur');
    expect(Object.keys(r!.others).sort()).toEqual(['en', 'fr']);
    expect(r?.others.fr).toBe('[fr] بہت اچھا فون');
    expect(r?.others.en).toBe('[en] بہت اچھا فون');
    expect(calls).toEqual([{ kind: 'detect', from: null, to: 'fr' }, { kind: 'translate', from: 'ur', to: 'en' }]);
  });

  it('returns null and never calls the provider when the text has nothing to translate', async () => {
    for (const t of ['12345', 'XL', 'a@b.co', '   ', '', null, undefined]) expect(await svc.translateForSave(t as never)).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it('returns null when translation is off', async () => {
    svc = testTranslations(ds, new OffTranslator());
    expect(await svc.translateForSave('Great phone')).toBeNull();
  });

  it('returns null when the language is undetermined', async () => {
    const { provider } = stub('und');
    svc = testTranslations(ds, provider);
    expect(await svc.translateForSave('???? ok')).toBeNull();
  });

  it('returns null when the daily budget would be exceeded, and sends nothing', async () => {
    process.env.TRANSLATE_DAILY_CHAR_LIMIT = '5';
    svc = testTranslations(ds, fake);
    expect(await svc.translateForSave('Great phone, fast delivery')).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it('returns null (never throws) when the provider fails', async () => {
    const { provider } = stub('en', { detect: async () => { throw new Error('Cloud Translation 503'); } });
    svc = testTranslations(ds, provider);
    await expect(svc.translateForSave('Great phone')).resolves.toBeNull();
  });

  it('returns null when the second call fails after the first worked', async () => {
    const { provider } = stub('ur', { translate: async () => { throw new Error('boom'); } });
    svc = testTranslations(ds, provider);
    await expect(svc.translateForSave('بہت اچھا فون')).resolves.toBeNull();
  });

  it('returns null when the provider is slower than TRANSLATE_SAVE_TIMEOUT_MS (read at call time)', async () => {
    const slow = stub('en', { detect: () => new Promise((r) => setTimeout(() => r([{ text: '[fr] x', sourceLang: 'en' }]), 400)) });
    svc = testTranslations(ds, slow.provider);
    process.env.TRANSLATE_SAVE_TIMEOUT_MS = '50';
    const t0 = Date.now();
    await expect(svc.translateForSave('Great phone')).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(300);
    process.env.TRANSLATE_SAVE_TIMEOUT_MS = '2000';
    await expect(svc.translateForSave('Great phone')).resolves.toMatchObject({ sourceLang: 'en' });
  });

  it('a late failure after the timeout is not an unhandled rejection', async () => {
    const late = stub('en', { detect: () => new Promise((_, rej) => setTimeout(() => rej(new Error('late')), 120)) });
    svc = testTranslations(ds, late.provider);
    process.env.TRANSLATE_SAVE_TIMEOUT_MS = '20';
    await expect(svc.translateForSave('Great phone')).resolves.toBeNull();
    await new Promise((r) => setTimeout(r, 200));
  });
});

describe('saveTranslated + i18nFor', () => {
  async function review(text: string, id?: string) {
    const repo = ds.getRepository(Review);
    return repo.save(repo.create({ ...(id ? { id } : {}), productId: 'p1', userId: 'u1', author: 'A', rating: 5, text }));
  }
  const rowsOf = (id: string) => ds.getRepository(Translation).find({ where: { entityId: id }, order: { locale: 'ASC' } });

  it('writes one machine row per other language under the kind\'s field', async () => {
    const r = await review('Great phone');
    await svc.saveTranslated('review', r.id, await svc.translateForSave('Great phone'));
    const rows = await rowsOf(r.id);
    expect(rows.map((x) => [x.entityType, x.field, x.locale, x.value, x.origin, x.sourceLang, x.sourceHash])).toEqual([
      ['review', 'text', 'fr', '[fr] Great phone', 'machine', 'en', sourceHash('en', 'Great phone')],
    ]);
    await svc.saveTranslated('review_reply', r.id, await svc.translateForSave('Thank you'));
    expect((await rowsOf(r.id)).map((x) => [x.entityType, x.field])).toEqual([['review', 'text'], ['review_reply', 'reply']]);
  });

  it('swallows a failing write: the save never fails because of a translator', async () => {
    const r = await review('Great phone');
    jest.spyOn(ds.getRepository(Translation), 'insert').mockRejectedValue(new Error('disk full'));
    await expect(svc.saveTranslated('review', r.id, await svc.translateForSave('Great phone'))).resolves.toBeUndefined();
    await expect(svc.saveTranslated('review', r.id, null)).resolves.toBeUndefined();
  });

  it('composes both languages: the original for the source language, the machine text for the other', async () => {
    const a = await review('Great phone');
    const b = await review('Très bon produit');
    await svc.saveTranslated('review', a.id, await svc.translateForSave('Great phone'));
    await svc.saveTranslated('review', b.id, await svc.translateForSave('Très bon produit'));
    const m = await svc.i18nFor('review', [{ id: a.id, text: 'Great phone' }, { id: b.id, text: 'Très bon produit' }]);
    expect(m.get(a.id)).toEqual({ sourceLang: 'en', en: 'Great phone', fr: '[fr] Great phone' });
    expect(m.get(b.id)).toEqual({ sourceLang: 'fr', fr: 'Très bon produit', en: '[en] Très bon produit' });
  });

  it('a text in neither language serves both machine texts and its own sourceLang', async () => {
    const { provider } = stub('ur');
    svc = testTranslations(ds, provider);
    const r = await review('بہت اچھا فون');
    await svc.saveTranslated('review', r.id, await svc.translateForSave('بہت اچھا فون'));
    expect((await svc.i18nFor('review', [{ id: r.id, text: 'بہت اچھا فون' }])).get(r.id)).toEqual({ sourceLang: 'ur', fr: '[fr] بہت اچھا فون', en: '[en] بہت اچھا فون' });
  });

  it('looks up many ids with ONE query (no N+1)', async () => {
    const ids: { id: string; text: string }[] = [];
    for (let i = 0; i < 25; i++) {
      const r = await review(`Great phone ${i}`);
      await svc.saveTranslated('review', r.id, await svc.translateForSave(r.text));
      ids.push({ id: r.id, text: r.text });
    }
    const spy = jest.spyOn(ds.getRepository(Translation), 'find');
    const m = await svc.i18nFor('review', ids);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(m.size).toBe(25);
  });

  it('skips stale rows: text edited since, so the old translation is not served', async () => {
    const r = await review('Great phone');
    await svc.saveTranslated('review', r.id, await svc.translateForSave('Great phone'));
    expect((await svc.i18nFor('review', [{ id: r.id, text: 'Great phone' }])).size).toBe(1);
    expect((await svc.i18nFor('review', [{ id: r.id, text: 'Terrible phone' }])).has(r.id)).toBe(false);
  });

  it('gives no entry (the field stays absent) for no rows, no text, or an empty text', async () => {
    const r = await review('Great phone');
    const m = await svc.i18nFor('review', [{ id: r.id, text: 'Great phone' }, { id: 'x', text: null }, { id: 'y', text: '  ' }]);
    expect(m.size).toBe(0);
    expect((await svc.i18nFor('review', [])).size).toBe(0);
  });

  it('writes a second save in place and drops a machine row the new source language no longer needs', async () => {
    const r = await review('Great phone');
    await svc.saveTranslated('review', r.id, await svc.translateForSave('Great phone')); // en -> fr row
    await svc.saveTranslated('review', r.id, await svc.translateForSave('Très bon produit', 'fr')); // fr -> en row
    expect((await rowsOf(r.id)).map((x) => [x.locale, x.sourceLang])).toEqual([['en', 'fr']]);
    expect((await svc.i18nFor('review', [{ id: r.id, text: 'Très bon produit' }])).get(r.id)).toEqual({ sourceLang: 'fr', fr: 'Très bon produit', en: '[en] Très bon produit' });
  });

  it('translate:text reuses the rows written at save: no provider call for either language', async () => {
    const r = await review('Great phone');
    await svc.saveTranslated('review', r.id, await svc.translateForSave('Great phone'));
    fake.calls.length = 0;
    expect(await svc.translateStored('review', r.id, 'fr')).toEqual({ text: '[fr] Great phone', sourceLang: 'en', same: false });
    expect(await svc.translateStored('review', r.id, 'en')).toEqual({ text: 'Great phone', sourceLang: 'en', same: true });
    expect(fake.calls).toHaveLength(0);
  });
});
