import { chooseTranslator } from './translation.module';
import { GoogleTranslator, MAX_CHARS, MAX_SEGMENTS, batchTexts, parseServiceAccount } from './google.translator';
import { FakeTranslator, OffTranslator } from './fake.translator';

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };

/** A fetch that answers like Cloud Translation v2 ("<to>:" in front of each text) and records its calls. */
function fakeFetch(opts: { status?: number; detect?: (t: string) => string; omit?: boolean } = {}) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    const body = JSON.parse(init.body) as { q: string[]; target: string; source?: string };
    if (opts.status && opts.status >= 400) {
      return { ok: false, status: opts.status, json: async () => ({ error: { message: 'Cloud Translation API has not been used in project 123' } }) };
    }
    const out = body.q.map((t) => ({ translatedText: `${body.target}:${t}`, ...(body.source ? {} : { detectedSourceLanguage: (opts.detect ?? (() => 'en'))(t) }) }));
    return { ok: true, status: 200, json: async () => ({ data: { translations: opts.omit ? out.slice(1) : out } }) };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const SA = { project_id: 'proj-1', client_email: 'svc@proj-1.iam.gserviceaccount.com', private_key: 'KEY' };

describe('GoogleTranslator', () => {
  it('posts a v2 request: segments, source, target and format text, with the API key', async () => {
    const { fn, calls } = fakeFetch();
    const g = new GoogleTranslator({ apiKey: 'k e y' }, fn);
    expect(await g.translate(['Black', 'White'], 'en', 'fr')).toEqual(['fr:Black', 'fr:White']);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://translation.googleapis.com/language/translate/v2?key=k%20e%20y');
    expect(JSON.parse(calls[0].init.body)).toEqual({ q: ['Black', 'White'], source: 'en', target: 'fr', format: 'text' });
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.authorization).toBeUndefined();
  });

  it('without an API key it uses a service-account token and the project header', async () => {
    const { fn, calls } = fakeFetch();
    const g = new GoogleTranslator({ serviceAccount: SA }, fn);
    // The token comes from firebase-admin; replace it so no network or real key is involved.
    (g as unknown as { accessToken: () => Promise<string> }).accessToken = async () => 'tok-1';
    await g.translate(['Hello'], 'en', 'fr');
    expect(calls[0].url).toBe('https://translation.googleapis.com/language/translate/v2');
    expect(calls[0].init.headers.authorization).toBe('Bearer tok-1');
    expect(calls[0].init.headers['x-goog-user-project']).toBe('proj-1');
  });

  it('refuses to call without any credential', async () => {
    const { fn, calls } = fakeFetch();
    await expect(new GoogleTranslator({}, fn).translate(['x'], 'en', 'fr')).rejects.toThrow('No translation credential');
    expect(calls).toHaveLength(0);
  });

  it('splits into calls of at most 100 segments and keeps the order', async () => {
    const { fn, calls } = fakeFetch();
    const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const out = await new GoogleTranslator({ apiKey: 'k' }, fn).translate(texts, 'en', 'fr');
    expect(calls.map((c) => JSON.parse(c.init.body).q.length)).toEqual([100, 100, 50]);
    expect(out).toEqual(texts.map((t) => `fr:${t}`));
  });

  it('splits by characters too (25 000 per call) and sends a longer single text alone', async () => {
    expect(batchTexts(['a'.repeat(15_000), 'b'.repeat(15_000), 'c'.repeat(10)]).map((b) => b.map((x) => x.index))).toEqual([[0], [1, 2]]);
    expect(batchTexts(['a'.repeat(MAX_CHARS + 5), 'b']).map((b) => b.length)).toEqual([1, 1]);
    expect(MAX_SEGMENTS).toBe(100);
    expect(batchTexts([])).toEqual([]);
  });

  it('detects the source language when none is given', async () => {
    const { fn, calls } = fakeFetch({ detect: (t) => (t.startsWith('Très') ? 'fr-FR' : 'en') });
    const out = await new GoogleTranslator({ apiKey: 'k' }, fn).detect(['Très bon', 'Good'], 'en');
    expect(JSON.parse(calls[0].init.body)).toEqual({ q: ['Très bon', 'Good'], target: 'en', format: 'text' });
    expect(out).toEqual([
      { text: 'en:Très bon', sourceLang: 'fr' },
      { text: 'en:Good', sourceLang: 'en' },
    ]);
  });

  it('fails with Google\'s message but never echoes the text or the key', async () => {
    const { fn } = fakeFetch({ status: 403 });
    const err = await new GoogleTranslator({ apiKey: 'SECRET-KEY' }, fn).translate(['private words'], 'en', 'fr').catch((e: Error) => e);
    expect((err as Error).message).toMatch(/Cloud Translation 403: Cloud Translation API has not been used/);
    expect((err as Error).message).not.toMatch(/SECRET-KEY|private words/);
  });

  it('refuses an answer that does not match the request', async () => {
    const { fn } = fakeFetch({ omit: true });
    await expect(new GoogleTranslator({ apiKey: 'k' }, fn).translate(['a', 'b'], 'en', 'fr')).rejects.toThrow('unexpected answer');
  });
});

describe('credentials and provider choice', () => {
  const b64 = Buffer.from(JSON.stringify(SA)).toString('base64');

  it('reads FIREBASE_SERVICE_ACCOUNT_JSON as raw JSON or base64 (like push.service)', () => {
    expect(parseServiceAccount(JSON.stringify(SA))).toMatchObject({ project_id: 'proj-1' });
    expect(parseServiceAccount(b64)).toMatchObject({ client_email: SA.client_email });
    expect(parseServiceAccount('not json')).toBeNull();
    expect(parseServiceAccount('{"project_id":"x"}')).toBeNull();
    expect(parseServiceAccount(undefined)).toBeNull();
  });

  it('TRANSLATE_PROVIDER picks the provider; the default is google only when a credential exists', () => {
    expect(chooseTranslator({ TRANSLATE_PROVIDER: 'fake' })).toBeInstanceOf(FakeTranslator);
    expect(chooseTranslator({ TRANSLATE_PROVIDER: 'off', GOOGLE_TRANSLATE_API_KEY: 'k' })).toBeInstanceOf(OffTranslator);
    expect(chooseTranslator({ GOOGLE_TRANSLATE_API_KEY: 'k' })).toBeInstanceOf(GoogleTranslator);
    expect(chooseTranslator({ FIREBASE_SERVICE_ACCOUNT_JSON: b64 })).toBeInstanceOf(GoogleTranslator);
    expect(chooseTranslator({ TRANSLATE_PROVIDER: 'google', GOOGLE_TRANSLATE_API_KEY: 'k' })).toBeInstanceOf(GoogleTranslator);
    expect(chooseTranslator({})).toBeInstanceOf(OffTranslator);
    expect(chooseTranslator({ TRANSLATE_PROVIDER: 'google' })).toBeInstanceOf(OffTranslator);
    expect(chooseTranslator({ TRANSLATE_PROVIDER: 'nonsense', GOOGLE_TRANSLATE_API_KEY: 'k' })).toBeInstanceOf(OffTranslator);
  });

  it('the fake translator is deterministic and the off translator translates nothing', async () => {
    const fake = new FakeTranslator();
    expect(await fake.translate(['Black'], 'en', 'fr')).toEqual(['[fr] Black']);
    expect(await fake.translate(['Noir'], 'fr', 'en')).toEqual(['[en] Noir']);
    expect(await fake.detect(['Très bon produit'], 'en')).toEqual([{ text: '[en] Très bon produit', sourceLang: 'fr' }]);
    expect(await fake.detect(['Good product'], 'en')).toEqual([{ text: 'Good product', sourceLang: 'en' }]);
    const off = new OffTranslator();
    expect(off.enabled).toBe(false);
    expect(await off.translate(['x'])).toEqual(['x']);
  });
});
