"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/context/locale-context";

/** Previous / next for the server's limit + offset pages: "26–50 of 83". */
export function FinancePager({
  offset,
  limit,
  total,
  onChange,
  busy,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
  busy?: boolean;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  if (total <= limit) return total > 0 ? <p className="px-4 py-3 text-xs text-slate-500">{fr ? `${total} ligne(s)` : `${total} row${total === 1 ? "" : "s"}`}</p> : null;
  const from = offset + 1;
  const to = Math.min(total, offset + limit);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-xs text-slate-600">
      <span>{fr ? `${from}–${to} sur ${total}` : `${from}–${to} of ${total}`}</span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={offset <= 0 || busy}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 font-medium disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {fr ? "Précédent" : "Previous"}
        </button>
        <button
          type="button"
          disabled={offset + limit >= total || busy}
          onClick={() => onChange(offset + limit)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 font-medium disabled:opacity-40"
        >
          {fr ? "Suivant" : "Next"}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}
