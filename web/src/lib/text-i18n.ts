/**
 * Customer-written text (review, seller reply, question, answer, chat message) that arrives with its translations:
 * the server puts `xI18n` next to the text it translates, on lists and on realtime events. The page shows the one in its
 * language at once and swaps on a language switch without asking for anything. One decision, one place, tested on its own.
 */

/**
 * `sourceLang`: language the author wrote in (null when unknown).
 * `en` / `fr`: the text in that language (the original for the source language, the machine translation for the other).
 * A key is present only when the value exists. The whole object is absent when the server has nothing.
 */
export type TextI18n = { sourceLang: string | null; en?: string; fr?: string };

export interface PickedText {
  /** The text to show in the page's language. */
  text: string;
  /** It is a machine translation of what the author wrote ("Translated automatically" + a "See original" link). */
  machine: boolean;
}

const norm = (s: string): string => s.trim();

function value(i18n: TextI18n, lang: string): string | null {
  if (lang !== "en" && lang !== "fr") return null;
  const v = i18n[lang];
  return typeof v === "string" && norm(v) !== "" ? v : null;
}

/**
 * The translations, only when they still belong to the written text. A record that was edited and arrives with a
 * partial update can carry the old `xI18n`: the copy kept for the author's language no longer matches the text, so the
 * object is stale and nothing from it is shown (the on-demand fetch takes over). Without a known source language there is
 * nothing to compare and the object is trusted.
 */
export function freshI18n(i18n: TextI18n | null | undefined, original: string): TextI18n | null {
  if (!i18n || typeof i18n !== "object") return null;
  const src = i18n.sourceLang ? value(i18n, i18n.sourceLang) : null;
  if (src !== null && norm(src) !== norm(original)) return null;
  return i18n;
}

/** The text was written in another language than `locale` (what the viewer reads is a machine translation). */
export function isMachine(i18n: TextI18n | null | undefined, locale: string): boolean {
  return !!i18n && !!i18n.sourceLang && i18n.sourceLang !== locale;
}

/**
 * What the payload says to show for the page language `locale`, or null when it has nothing for it (absent object, no
 * key for this language, stale object): the caller then falls back to the on-demand fetch.
 */
export function pickI18n(i18n: TextI18n | null | undefined, locale: string, original: string): PickedText | null {
  const ok = freshI18n(i18n, original);
  if (!ok) return null;
  const text = value(ok, locale);
  if (text === null) return null;
  return { text, machine: isMachine(ok, locale) };
}

/** A list preview (last chat message): the viewer-language text when the payload has it, else the preview as sent. */
export function previewText(i18n: TextI18n | null | undefined, locale: string, preview: string | null | undefined): string {
  const base = preview ?? "";
  const picked = i18n ? value(i18n, locale) : null;
  return picked ?? base;
}

/**
 * A short stored text that sits in a title or a list cell (a ticket subject): the text for the page language when the payload has
 * it and it still belongs to the written text, else the text as written. Never a request: a title does not wait for a translator.
 */
export function shownText(i18n: TextI18n | null | undefined, locale: string, original: string | null | undefined): string {
  const base = original ?? "";
  return pickI18n(i18n, locale, base)?.text ?? base;
}
