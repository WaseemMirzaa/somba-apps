/**
 * Customer-written text that follows the viewer's language by itself (questions and answers): when to ask the server
 * for the translation without anyone clicking. One decision, one place, tested on its own.
 */
export interface AutoTranslateInput {
  /** The component was asked to translate by itself. */
  auto: boolean;
  /** The server has a translation service (no link and no request without one). */
  translationOn: boolean;
  /** The text is already known to be in the viewer's language. */
  alreadyReadable: boolean;
  /** There is text to translate. */
  hasText: boolean;
  /** This record already has an answer, an attempt or a choice for the current language (a language switch starts over). */
  started: boolean;
}

export function shouldAutoTranslate(i: AutoTranslateInput): boolean {
  return i.auto && i.translationOn && !i.alreadyReadable && i.hasText && !i.started;
}
