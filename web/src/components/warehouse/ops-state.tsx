"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLocale } from "@/context/locale-context";

/** The server's own error text plus a retry button (never a silent empty state). */
export function OpsError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-red-100">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {fr ? "Réessayer" : "Retry"}
        </button>
      )}
    </div>
  );
}

export function OpsLoading() {
  const { locale } = useLocale();
  return (
    <p role="status" className="py-8 text-center text-sm text-slate-500">
      {locale === "fr" ? "Chargement…" : "Loading…"}
    </p>
  );
}

/** Grouped daily bars for 1..3 series with real dates, values on each bar and a legend. */
export function DailyGroupedBars({
  days,
  series,
  height = 200,
}: {
  days: string[];
  series: { label: string; color: string; values: number[] }[];
  height?: number;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const total = series.flatMap((s) => s.values).reduce((a, b) => a + b, 0);
  const label = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(fr ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {days.map((d, i) => (
          <div key={d} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
            {series.map((s) => (
              <div
                key={s.label}
                title={`${label(d)} · ${s.label}: ${s.values[i]}`}
                className="w-full max-w-5 rounded-t"
                style={{ height: `${Math.max((s.values[i] / max) * 100, s.values[i] > 0 ? 3 : 0)}%`, background: s.color }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-[10px] text-slate-500">
        {days.map((d) => (
          <span key={d} className="min-w-0 flex-1 truncate text-center">{label(d)}</span>
        ))}
      </div>
      {total === 0 && <p className="mt-2 text-center text-xs text-slate-500">{fr ? "Aucune activité sur cette période." : "No activity in this period."}</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} ({s.values.reduce((a, b) => a + b, 0)})
          </span>
        ))}
      </div>
    </div>
  );
}
