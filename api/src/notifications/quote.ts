import { frenchNotice } from './localize';
import type { NoticeInput } from './notifications.service';
import type { SaveTranslation, TextI18n } from '../translation/translation.service';

/** The two languages a notice is written in. */
export type Lang = 'en' | 'fr';

/** What a notice that quotes a person's words is built from. */
export interface QuotedNoticeInput {
  title: string;
  /** The sentence around the quote, in `lang`: `(quote) => `${ref}: ${quote}``. Called once for English and once for French. */
  body: (quote: string, lang: Lang) => string;
  /** The text as the person wrote it. */
  text: string;
  /**
   * Both languages of `text`, already in hand at the call site: the `TextI18n` that `i18nFor` serves, or the
   * `SaveTranslation` that `translateForSave` returned before the insert. Absent: the original is quoted in both.
   */
  i18n?: TextI18n | SaveTranslation | null;
  /** The quote is cut to this many characters (default 140), after trimming. */
  max?: number;
  /** Collapse every run of whitespace to one space before cutting (chat previews). */
  collapse?: boolean;
  type?: string;
  entityId?: string;
  extra?: Record<string, string>;
}

/** The text in each notice language: the translation when it exists, else the original. */
export function versionsOf(text: string, i18n?: TextI18n | SaveTranslation | null): Record<Lang, string> {
  const out: Record<Lang, string> = { en: text, fr: text };
  if (!i18n) return out;
  if ('others' in i18n) {
    for (const l of ['en', 'fr'] as const) {
      const v = i18n.sourceLang === l ? text : i18n.others[l];
      if (typeof v === 'string' && v.trim()) out[l] = v;
    }
    return out;
  }
  for (const l of ['en', 'fr'] as const) {
    const v = i18n[l];
    if (typeof v === 'string' && v.trim()) out[l] = v;
  }
  return out;
}

/** What one quote looks like inside a notice. */
export const quoteOf = (s: string, max = 140, collapse = false): string => (collapse ? s.trim().replace(/\s+/g, ' ') : s.trim()).slice(0, max);

/**
 * A notice whose body QUOTES somebody's words, in each recipient's language: the English body quotes the English version
 * of the text, `fr` quotes the French version, so a push, the bell and a web push all follow the receiver's language
 * (`users.locale`), words they did not write included. The French goes through the same `frenchNotice` as every other
 * notice, so the wording around the quote stays consistent. No translation: the original text is quoted in both.
 */
export function quotedNotice(i: QuotedNoticeInput): NoticeInput {
  const v = versionsOf(i.text, i.i18n);
  const english = i.body(quoteOf(v.en, i.max, i.collapse), 'en');
  const french = i.body(quoteOf(v.fr, i.max, i.collapse), 'fr');
  // Same words in both languages (no translation, or a text with nothing to translate): nothing authored. The built-in
  // patterns in `localize.ts` then give the French exactly as they do for every notice without a quote.
  const fr = french === english ? null : (frenchNotice({ title: i.title, body: french }) ?? { title: i.title, body: french });
  return {
    title: i.title,
    body: english,
    ...(i.type ? { type: i.type } : {}),
    ...(i.entityId ? { entityId: i.entityId } : {}),
    ...(i.extra ? { extra: i.extra } : {}),
    ...(fr ? { fr } : {}),
  };
}
