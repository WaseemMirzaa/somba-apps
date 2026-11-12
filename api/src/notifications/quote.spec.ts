import { frenchNotice } from './localize';
import { quoteOf, quotedNotice, versionsOf } from './quote';

describe('versionsOf', () => {
  it('a TextI18n: each language is its own version, the original fills a missing one', () => {
    expect(versionsOf('Is it new?', { sourceLang: 'en', en: 'Is it new?', fr: 'Est-il neuf ?' })).toEqual({ en: 'Is it new?', fr: 'Est-il neuf ?' });
    expect(versionsOf('Bonjour', { sourceLang: 'fr', fr: 'Bonjour' })).toEqual({ en: 'Bonjour', fr: 'Bonjour' });
  });

  it('a SaveTranslation: the source language is the text itself, the other one the machine translation', () => {
    expect(versionsOf('Est-il neuf ?', { sourceLang: 'fr', others: { en: 'Is it new?' }, sourceHash: 'h' })).toEqual({ en: 'Is it new?', fr: 'Est-il neuf ?' });
    expect(versionsOf('Is it new?', { sourceLang: 'en', others: { fr: 'Est-il neuf ?' }, sourceHash: 'h' })).toEqual({ en: 'Is it new?', fr: 'Est-il neuf ?' });
    // a text in neither language gets both translations
    expect(versionsOf('Ni sambe', { sourceLang: 'ln', others: { en: 'EN', fr: 'FR' }, sourceHash: 'h' })).toEqual({ en: 'EN', fr: 'FR' });
  });

  it('no translation: the original in both', () => {
    expect(versionsOf('Hello', null)).toEqual({ en: 'Hello', fr: 'Hello' });
    expect(versionsOf('Hello', undefined)).toEqual({ en: 'Hello', fr: 'Hello' });
  });
});

describe('quotedNotice', () => {
  const i18n = { sourceLang: 'fr', en: 'Is it new?', fr: 'Est-il neuf ?' };

  it('the English body quotes the English version, `fr` quotes the French one', () => {
    const n = quotedNotice({ title: 'New question on your product', body: (q) => `Phone: ${q}`, text: 'Est-il neuf ?', i18n, type: 'question', entityId: 'q1' });
    expect(n).toEqual({
      title: 'New question on your product',
      body: 'Phone: Is it new?',
      type: 'question',
      entityId: 'q1',
      fr: { title: expect.any(String), body: 'Phone: Est-il neuf ?' },
    });
    // the title is translated by the same table as every other notice
    expect(n.fr?.title).toBe(frenchNotice({ title: 'New question on your product', body: '' })?.title);
    expect(n.fr?.title).not.toBe('New question on your product');
  });

  it('the wording around the quote is the one localize.ts already has', () => {
    const n = quotedNotice({ title: 'Return rejected', body: (q) => `${'RET-1'} · SOM-9: ${q}`, text: 'Trop tard', i18n: { sourceLang: 'fr', en: 'Too late', fr: 'Trop tard' } });
    expect(n.body).toBe('RET-1 · SOM-9: Too late');
    expect(n.fr?.body).toBe('RET-1 · SOM-9: Trop tard');
    expect(n.fr?.title).toBe(frenchNotice({ title: 'Return rejected', body: '' })?.title);
  });

  it('no translation (or the same words): the original is quoted in both and nothing is authored', () => {
    expect(quotedNotice({ title: 'New question on your product', body: (q) => `Phone: ${q}`, text: 'Est-il neuf ?' })).toEqual({ title: 'New question on your product', body: 'Phone: Est-il neuf ?' });
    expect(quotedNotice({ title: 'New question on your product', body: (q) => `Phone: ${q}`, text: 'ok', i18n: { sourceLang: 'en', en: 'ok', fr: 'ok' } }).fr).toBeUndefined();
  });

  it('the sentence can follow the language (a product name in each)', () => {
    const n = quotedNotice({ title: 'New question on your product', body: (q, lang) => `${lang === 'fr' ? 'Téléphone' : 'Phone'}: ${q}`, text: 'Est-il neuf ?', i18n });
    expect([n.body, n.fr?.body]).toEqual(['Phone: Is it new?', 'Téléphone: Est-il neuf ?']);
  });

  it('cuts each version (not the original) and can collapse whitespace like a chat preview', () => {
    const long = 'x'.repeat(300);
    const n = quotedNotice({ title: 'T', body: (q) => q, text: long, i18n: { sourceLang: 'en', en: long, fr: 'y'.repeat(300) }, max: 120 });
    expect([n.body.length, n.fr?.body.length]).toEqual([120, 120]);
    expect(quoteOf('a \n  b\t c', 140, true)).toBe('a b c');
    expect(quoteOf('  padded ')).toBe('padded');
  });
});
