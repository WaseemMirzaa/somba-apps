"use client";

import { useState } from "react";
import { useLocale } from "@/context/locale-context";

/**
 * "Load more" for lists the server hands out in pages (limit/offset). Shows how
 * many rows are loaded, loads the next page on demand and shows the server's
 * error with a retry instead of failing silently.
 */
export function LoadMore({
  hasMore,
  onLoad,
  loaded,
  noun,
}: {
  hasMore: boolean;
  onLoad: () => Promise<void>;
  loaded: number;
  noun: { en: string; fr: string };
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      await onLoad();
    } catch (e) {
      setError((e as Error).message || (fr ? "Échec du chargement." : "Could not load more."));
    } finally {
      setBusy(false);
    }
  }

  if (!hasMore && !error) {
    return loaded > 0 ? (
      <p className="text-center text-xs text-slate-500">
        {fr ? `${loaded} ${noun.fr} chargé(e)s — tout est affiché.` : `${loaded} ${noun.en} loaded — that is everything.`}
      </p>
    ) : null;
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-slate-500">
        {fr ? `${loaded} ${noun.fr} affiché(e)s` : `${loaded} ${noun.en} shown`}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      )}
      <button
        type="button"
        onClick={() => void load()}
        disabled={busy}
        className="rounded-xl border border-[var(--border)] bg-white px-5 py-2.5 text-sm font-medium shadow-sm hover:border-[var(--primary)] disabled:opacity-60"
      >
        {busy ? (fr ? "Chargement…" : "Loading…") : error ? (fr ? "Réessayer" : "Retry") : fr ? "Charger plus" : "Load more"}
      </button>
    </div>
  );
}
