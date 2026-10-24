/** Languages the platform serves today. Adding one (ln, sw) is a data change: no schema, no new columns. */
export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const isLocale = (x: unknown): x is Locale => typeof x === 'string' && (LOCALES as readonly string[]).includes(x);

/** The other language of a two-language platform. */
export const otherLocale = (l: string): Locale => (l === 'fr' ? 'en' : 'fr');

/** One text with the language the provider recognised it as. */
export interface Detected {
  text: string;
  sourceLang: string;
}

/**
 * A machine-translation backend. `translate` keeps order and length (`out[i]` is `texts[i]` translated);
 * `detect` also tells which language each text was in (reviews and Q&A come in either).
 */
export interface TranslatorProvider {
  readonly name: 'google' | 'fake' | 'off';
  /** False means nothing is translated: composition falls back to the source text and no jobs are queued. */
  readonly enabled: boolean;
  translate(texts: string[], from: string, to: string): Promise<string[]>;
  detect(texts: string[], to: string): Promise<Detected[]>;
}

export const TRANSLATOR = Symbol('TRANSLATOR');
