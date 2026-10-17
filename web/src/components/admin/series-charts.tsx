"use client";

import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { shortDate } from "@/lib/admin-stats";

/**
 * Charts over REAL dated series (one row per UTC day, from the analytics
 * events). Bars are scaled to the series maximum, every bar has a tooltip and
 * the axis shows the real first/last day and the maximum value.
 */

export interface BarSeries {
  date: string;
  value: number;
  /** Optional second series drawn as dots. */
  secondary?: number;
}

export function DailyBarChart({
  data,
  valueLabel,
  secondaryLabel,
  money = true,
  height = 220,
}: {
  data: BarSeries[];
  valueLabel: string;
  secondaryLabel?: string;
  money?: boolean;
  height?: number;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const max = Math.max(...data.map((d) => d.value), 0);
  const secMax = Math.max(...data.map((d) => d.secondary ?? 0), 0);
  const fmt = (v: number) => (money ? formatCurrency(v, locale) : v.toLocaleString(fr ? "fr-FR" : "en-US"));
  const empty = max === 0 && secMax === 0;

  return (
    <div className="w-full">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0.5 text-right text-[10px] text-slate-400" style={{ height }} aria-hidden>
          <span>{fmt(max)}</span>
          <span>{fmt(max / 2)}</span>
          <span>0</span>
        </div>
        <div
          className="relative flex min-w-0 flex-1 items-end gap-px border-b border-l border-slate-200 sm:gap-0.5"
          style={{ height }}
          role="img"
          aria-label={`${valueLabel}, ${data.length} ${fr ? "jours" : "days"}`}
        >
          {[0.5, 1].map((g) => (
            <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-100" style={{ bottom: `${g * 100}%` }} />
          ))}
          {data.map((d) => {
            const h = max > 0 ? (d.value / max) * 100 : 0;
            const dot = secMax > 0 && d.secondary !== undefined ? (d.secondary / secMax) * 100 : null;
            return (
              <div
                key={d.date}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
                title={`${shortDate(d.date, locale)}: ${fmt(d.value)}${d.secondary !== undefined && secondaryLabel ? ` · ${secondaryLabel} ${d.secondary}` : ""}`}
              >
                <div
                  className="w-full rounded-t-sm bg-[var(--primary)]/25 transition-colors group-hover:bg-[var(--primary)]/45"
                  style={{ height: `${d.value > 0 ? Math.max(h, 1.5) : 0}%` }}
                />
                {dot !== null && d.secondary! > 0 && (
                  <span
                    className="absolute h-1.5 w-1.5 rounded-full bg-[var(--primary)] ring-2 ring-white"
                    style={{ bottom: `calc(${dot}% - 3px)` }}
                  />
                )}
              </div>
            );
          })}
          {empty && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              {fr ? "Aucune vente sur la période" : "No sales in this period"}
            </p>
          )}
        </div>
      </div>
      <div className="ml-12 mt-1.5 flex justify-between text-[10px] text-slate-400">
        <span>{data[0] ? shortDate(data[0].date, locale) : ""}</span>
        <span>{data[data.length - 1] ? shortDate(data[data.length - 1].date, locale) : ""}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--primary)]/25" /> {valueLabel}
        </span>
        {secondaryLabel && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--primary)]" /> {secondaryLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Grouped bars for a few small series (e.g. received / picked up / delivered per day). */
export function GroupedBarChart({
  data,
  series,
  height = 200,
}: {
  data: { date: string; values: number[] }[];
  series: { label: string; color: string }[];
  height?: number;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const max = Math.max(...data.flatMap((d) => d.values), 0);
  return (
    <div className="w-full">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0.5 text-right text-[10px] text-slate-400" style={{ height }} aria-hidden>
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex min-w-0 flex-1 items-end gap-2 border-b border-l border-slate-200 px-1" style={{ height }}>
          {data.map((d) => (
            <div
              key={d.date}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-px"
              title={`${shortDate(d.date, locale)} — ${series.map((s, i) => `${s.label}: ${d.values[i]}`).join(" · ")}`}
            >
              {d.values.map((v, i) => (
                <div
                  key={i}
                  className="w-full max-w-3 rounded-t-sm"
                  style={{ height: `${max > 0 ? (v / max) * 100 : 0}%`, minHeight: v > 0 ? 2 : 0, background: series[i].color }}
                />
              ))}
            </div>
          ))}
          {max === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              {fr ? "Aucun mouvement de colis" : "No parcel movement"}
            </p>
          )}
        </div>
      </div>
      <div className="ml-8 mt-1.5 flex justify-between px-1 text-[10px] text-slate-400">
        {data.map((d) => (
          <span key={d.date}>{shortDate(d.date, locale)}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
