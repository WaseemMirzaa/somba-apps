"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useTranslationEnabled } from "@/lib/shop-live";
import { shouldAutoTranslate } from "@/lib/translate-auto";
import { pickI18n, freshI18n, type TextI18n } from "@/lib/text-i18n";

/** What the server can translate on demand: stored records only (the request carries an id, never free text). */
export type TranslateKind =
  | "review"
  | "review_reply"
  | "question"
  | "answer"
  | "chat_message"
  // Private kinds (docs/contracts/stored-text-i18n.md): only the people who may read the record are answered.
  | "support_ticket"
  | "support_message"
  | "dispute_message"
  | "dispute_reason"
  | "dispute_reply"
  | "dispute_resolution"
  | "exchange_reason"
  | "exchange_reply"
  | "replacement_reason"
  | "replacement_reply";

interface TranslateResult {
  text: string;
  sourceLang?: string | null;
  /** The text is already in the target language: there is nothing to translate. */
  same?: boolean;
}

// One answer per record and language for the whole session (the server caches it too).
const answers = new Map<string, TranslateResult>();

// A request already on its way for a record and language is shared (a page of questions never asks twice).
const inflight = new Map<string, Promise<TranslateResult>>();

async function fetchTranslation(key: string, kind: TranslateKind, id: string, target: string): Promise<TranslateResult> {
  const cached = answers.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = socketClient
    .request<TranslateResult>("translate:text", { kind, id, target })
    .then((res) => {
      answers.set(key, res);
      return res;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

type View = { key: string; busy: boolean; shown: boolean; same: boolean; text: string; failed?: boolean };

/**
 * A piece of stored, person-written text (review, seller reply, question, answer, chat message, support ticket, return / dispute / exchange / replacement text), shown in the page's language
 * by itself, no click.
 *
 * 1. The payload carries the translations (`i18n`, see lib/text-i18n.ts): the text for the page language is shown at once and
 *    a language switch swaps it with no request. When it is a machine translation (the author wrote in another language) the
 *    "Translated automatically" note and a "See original" link show; "See original" shows the written text (until the
 *    language changes again) and the link then reads "See translation". Written in the page language: no note, no link.
 * 2. The payload has nothing for this language (no object, no key, stale): with `auto` the translation is fetched by itself
 *    (`translate:text`) and follows a language switch. A failed attempt is silent: the written text stays and the link retries.
 *
 * Without `auto` (not used any more by the pages) the fetch only happens when the link is clicked.
 */
export function TranslatableText({
  kind,
  id,
  text,
  sourceLang,
  i18n,
  className,
  auto = false,
}: {
  kind: TranslateKind;
  id: string;
  text: string;
  /** Known language of the text (skips the link when it already equals the viewer's language). `i18n.sourceLang` wins. */
  sourceLang?: string | null;
  /** The translations that came with the record (`textI18n`, `replyI18n`, `questionI18n`, `answerI18n`). */
  i18n?: TextI18n | null;
  className?: string;
  /** Translate into the page's language by itself when the payload has no translation, and follow a language switch. */
  auto?: boolean;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const translationOn = useTranslationEnabled();
  const fr = locale === "fr";
  const key = `${kind}:${id}:${locale}`;
  const [state, setState] = useState<View | null>(null);
  // The viewer asked for the written text of this record in this language (a language switch starts over).
  const [originalKey, setOriginalKey] = useState<string | null>(null);
  // A language switch (or another record) starts over.
  const view = state && state.key === key ? state : null;

  // What the payload says for this language (null: nothing usable, the fetch path below takes over).
  const picked = pickI18n(i18n, locale, text);
  const knownSource = freshI18n(i18n, text)?.sourceLang ?? sourceLang;
  const alreadyReadable = !!knownSource && knownSource === locale;

  // Automatic mode: ask once per record and language, as soon as there is nothing yet for the current language.
  const wantsAuto = shouldAutoTranslate({ auto, translationOn, alreadyReadable, hasText: !!text, started: view !== null || picked !== null });
  useEffect(() => {
    if (!wantsAuto) return;
    let stale = false;
    fetchTranslation(key, kind, id, locale)
      .then((res) => {
        if (stale) return;
        setState((cur) => (cur && cur.key !== key ? cur : { key, busy: false, shown: !res.same && !!res.text, same: !!res.same || !res.text, text: res.text ?? "" }));
      })
      .catch(() => {
        if (stale) return;
        setState((cur) => (cur && cur.key !== key ? cur : { key, busy: false, shown: false, same: false, text: "", failed: true }));
      });
    return () => {
      stale = true;
    };
  }, [wantsAuto, key, kind, id, locale]);

  if (!text) return null;

  // The translations rode in with the record: no request, no wait.
  if (picked) {
    const original = originalKey === key;
    return (
      <>
        <p className={className}>{original ? text : picked.text}</p>
        {picked.machine && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
            <button type="button" onClick={() => setOriginalKey(original ? null : key)} className="font-medium text-[var(--primary)] hover:underline">
              {original ? (fr ? "Voir la traduction" : "See translation") : fr ? "Voir l'original" : "See original"}
            </button>
            {!original && <span className="text-slate-500">{fr ? "Traduit automatiquement" : "Translated automatically"}</span>}
          </p>
        )}
      </>
    );
  }

  async function toggle() {
    if (view?.shown) {
      setState({ ...view, shown: false });
      return;
    }
    const cached = answers.get(key);
    if (cached) {
      setState({ key, busy: false, shown: !cached.same, same: !!cached.same, text: cached.text });
      return;
    }
    setState({ key, busy: true, shown: false, same: false, text: "" });
    try {
      const res = await fetchTranslation(key, kind, id, locale);
      setState({ key, busy: false, shown: !res.same && !!res.text, same: !!res.same || !res.text, text: res.text ?? "" });
    } catch (e) {
      setState(null);
      toast((e as Error).message || (fr ? "Traduction impossible pour le moment." : "Could not translate right now."), "error");
    }
  }

  const showLink = translationOn && !alreadyReadable && !view?.same;

  return (
    <>
      <p className={className}>{view?.shown ? view.text : text}</p>
      {showLink && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={view?.busy}
            className="font-medium text-[var(--primary)] hover:underline disabled:opacity-60"
          >
            {view?.busy ? "…" : view?.shown ? (fr ? "Voir l'original" : "See original") : fr ? "Voir la traduction" : "See translation"}
          </button>
          {view?.shown && <span className="text-slate-500">{fr ? "Traduit automatiquement" : "Translated automatically"}</span>}
        </p>
      )}
    </>
  );
}

/**
 * Same as {@link TranslatableText} (in the page language by itself, `auto`), but a record without an id (an older server's
 * support message) just shows its text: there is nothing to ask a translator about.
 */
export function StoredText({
  kind,
  id,
  text,
  i18n,
  className,
}: {
  kind: TranslateKind;
  id?: string | null;
  text: string;
  i18n?: TextI18n | null;
  className?: string;
}) {
  if (!id) return text ? <p className={className}>{text}</p> : null;
  return <TranslatableText kind={kind} id={id} auto text={text} i18n={i18n} className={className} />;
}
