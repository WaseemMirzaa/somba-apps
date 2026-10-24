"use client";

import { useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";

/** What the server can translate on demand: stored records only (the request carries an id, never free text). */
export type TranslateKind = "review" | "review_reply" | "question" | "answer";

interface TranslateResult {
  text: string;
  sourceLang?: string | null;
  /** The text is already in the target language: there is nothing to translate. */
  same?: boolean;
}

// One answer per record and language for the whole session (the server caches it too).
const answers = new Map<string, TranslateResult>();

type View = { key: string; busy: boolean; shown: boolean; same: boolean; text: string };

/**
 * A piece of customer-written text (review, seller reply, question, answer) with a "See translation" link.
 * The link asks the server for the stored record's translation (`translate:text`) and shows what comes back;
 * "See original" goes back. When the server says the text is already in the viewer's language the link disappears.
 */
export function TranslatableText({
  kind,
  id,
  text,
  sourceLang,
  className,
}: {
  kind: TranslateKind;
  id: string;
  text: string;
  /** Known language of the text (skips the link when it already equals the viewer's language). */
  sourceLang?: string | null;
  className?: string;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const key = `${kind}:${id}:${locale}`;
  const [state, setState] = useState<View | null>(null);
  // A language switch (or another record) starts over.
  const view = state && state.key === key ? state : null;

  if (!text) return null;

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
      const res = await socketClient.request<TranslateResult>("translate:text", { kind, id, target: locale });
      answers.set(key, res);
      setState({ key, busy: false, shown: !res.same && !!res.text, same: !!res.same || !res.text, text: res.text ?? "" });
    } catch (e) {
      setState(null);
      toast((e as Error).message || (fr ? "Traduction impossible pour le moment." : "Could not translate right now."), "error");
    }
  }

  const alreadyReadable = !!sourceLang && sourceLang === locale;
  const showLink = !alreadyReadable && !view?.same;

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
