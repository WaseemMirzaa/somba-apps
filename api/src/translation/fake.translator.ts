import type { Detected, TranslatorProvider } from './translator.provider';

const FRENCH_HINTS = /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|des|une|est|très|pour|avec|je|nous|vous|merci|bon|bien|produit|livraison|rapide|qualité)\b/i;

/** Deterministic stand-in for tests, smokes and CI: "[fr] text" / "[en] text". Never calls the network. */
export class FakeTranslator implements TranslatorProvider {
  readonly name = 'fake' as const;
  readonly enabled = true;
  /** Every batch it was asked to translate, so tests can assert on calls and sizes. */
  readonly calls: { texts: string[]; from: string | null; to: string }[] = [];

  async translate(texts: string[], from: string, to: string): Promise<string[]> {
    this.calls.push({ texts: [...texts], from, to });
    return texts.map((t) => `[${to}] ${t}`);
  }

  async detect(texts: string[], to: string): Promise<Detected[]> {
    this.calls.push({ texts: [...texts], from: null, to });
    return texts.map((t) => {
      const stripped = t.replace(/^\[(?:en|fr)\]\s*/, '');
      const lang = /^\[fr\]/.test(t) ? 'fr' : /^\[en\]/.test(t) ? 'en' : FRENCH_HINTS.test(stripped) ? 'fr' : 'en';
      return { text: lang === to ? t : `[${to}] ${stripped}`, sourceLang: lang };
    });
  }
}

/** Nothing is translated (no credential, or switched off). */
export class OffTranslator implements TranslatorProvider {
  readonly name = 'off' as const;
  readonly enabled = false;
  async translate(texts: string[]): Promise<string[]> {
    return texts;
  }
  async detect(texts: string[]): Promise<Detected[]> {
    return texts.map((text) => ({ text, sourceLang: 'und' }));
  }
}
