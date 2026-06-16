"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

type Point = { label: string; value: number };

function normalize(values: number[]) {
  const max = Math.max(...values, 1);
  return values.map((v) => v / max);
}

/** Area + line revenue chart */
export function RevenueAreaChart({
  data,
  valueKey,
  height = 200,
  color = "#1d4ed8",
}: {
  data: readonly { label: string; [k: string]: string | number }[];
  valueKey: string;
  height?: number;
  color?: string;
}) {
  const values = data.map((d) => Number(d[valueKey]));
  const norm = normalize(values);
  const w = 100;
  const h = 40;
  const pad = 2;
  const points = norm.map((n, i) => {
    const x = pad + (i / Math.max(norm.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - n * (h - pad * 2);
    return `${x},${y}`;
  });
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${w - pad},${h - pad} L ${pad},${h - pad} Z`;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad} y1={h - pad - g * (h - pad * 2)} x2={w - pad} y2={h - pad - g * (h - pad * 2)} stroke="#e2e8f0" strokeWidth="0.15" />
        ))}
        <path d={areaPath} fill="url(#areaFill)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" />
        {norm.map((n, i) => {
          const x = pad + (i / Math.max(norm.length - 1, 1)) * (w - pad * 2);
          const y = h - pad - n * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r="0.8" fill={color} />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Dual metric chart — revenue bars + orders line */
export function DualMetricChart({
  data,
  height = 220,
}: {
  data: readonly { label: string; revenue: number; orders: number }[];
  height?: number;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const revNorm = normalize(data.map((d) => d.revenue));
  const ordNorm = normalize(data.map((d) => d.orders));

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex h-[calc(100%-24px)] items-end gap-1">
        {data.map((d, i) => (
          <div key={d.label} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t-md bg-blue-100 transition-colors group-hover:bg-blue-200"
              style={{ height: `${Math.max(revNorm[i] * 100, 4)}%` }}
            />
            <div
              className="absolute rounded-full bg-[var(--primary)] ring-2 ring-white"
              style={{
                bottom: `calc(${Math.max(ordNorm[i] * 100, 8)}% + 4px)`,
                width: 6,
                height: 6,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-100" /> {fr ? "Chiffre d'affaires" : "Revenue"}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--primary)]" /> {fr ? "Commandes" : "Orders"}</span>
      </div>
    </div>
  );
}

/** Horizontal retention bars */
export function RetentionBarChart({
  data,
}: {
  data: readonly { month: string; retention: number; churn: number }[];
}) {
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.month}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-slate-700">{d.month}</span>
            <span className="font-bold text-emerald-600">{d.retention}%</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${d.retention}%` }} />
            <div className="h-full bg-slate-200" style={{ width: `${d.churn}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut / segment chart */
export function SegmentDonut({
  segments,
  size = 140,
}: {
  segments: readonly { label: string; pct: number; color: string }[];
  size?: number;
}) {
  const r = 16;
  const cx = 20;
  const cy = 20;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        {segments.map((s) => {
          const dash = (s.pct / 100) * circumference;
          const el = (
            <circle
              key={s.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="5"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="ml-auto font-bold text-slate-900">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Funnel chart */
export function FunnelChart({
  stages,
}: {
  stages: readonly { stage: string; count: number; pct: number }[];
}) {
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.stage} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-xs font-medium text-slate-600">{s.stage}</div>
          <div className="flex-1">
            <div
              className={cn(
                "flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-white transition-all",
                i === 0 ? "bg-[var(--primary)]" : "bg-blue-400"
              )}
              style={{ width: `${Math.max(s.pct, 12)}%`, opacity: 1 - i * 0.08 }}
            >
              {s.count.toLocaleString()}
            </div>
          </div>
          <span className="w-10 text-right text-xs font-bold text-slate-500">{s.pct}%</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bar chart for products/categories */
export function HorizontalBarChart({
  items,
  valueKey,
  labelKey,
  formatValue,
  maxBars = 5,
}: {
  items: readonly Record<string, string | number>[];
  valueKey: string;
  labelKey: string;
  formatValue?: (v: number) => string;
  maxBars?: number;
}) {
  const slice = items.slice(0, maxBars);
  const max = Math.max(...slice.map((i) => Number(i[valueKey])), 1);

  return (
    <div className="space-y-3">
      {slice.map((item, i) => {
        const val = Number(item[valueKey]);
        return (
          <div key={String(item[labelKey])}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-slate-700 truncate pr-2">{String(item[labelKey])}</span>
              <span className="shrink-0 font-bold text-slate-900">
                {formatValue ? formatValue(val) : val.toLocaleString()}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--primary)]"
                style={{ width: `${(val / max) * 100}%`, opacity: 1 - i * 0.12 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Goal progress ring */
export function GoalProgress({
  label,
  current,
  target,
  unit = "",
  format,
}: {
  label: string;
  current: number;
  target: number;
  unit?: string;
  format?: (n: number) => string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const pct = Math.min(Math.round((current / target) * 100), 100);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <svg width="88" height="88" className="-rotate-90">
          <circle cx="44" cy="44" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">
          {pct}%
        </span>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-900">
          {format ? format(current) : current.toLocaleString()}
          {unit}
        </p>
        <p className="text-xs text-slate-400">
          {fr ? "sur" : "of"} {format ? format(target) : target.toLocaleString()}{unit}
        </p>
      </div>
    </div>
  );
}

/** Sparkline for stat cards */
export function Sparkline({ values, color = "#1d4ed8" }: { values: number[]; color?: string }) {
  const norm = normalize(values);
  const points = norm.map((n, i) => `${(i / Math.max(norm.length - 1, 1)) * 100},${100 - n * 100}`).join(" ");

  return (
    <svg viewBox="0 0 100 100" className="h-8 w-20" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}
