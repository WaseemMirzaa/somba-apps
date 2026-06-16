"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { cn } from "@/lib/utils";

export const ANALYTICS_PERIODS = ["7D", "30D", "90D"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export function AnalyticsKpiCard({
  title,
  value,
  change,
  positive,
  spark,
  icon: Icon,
}: {
  title: string;
  value: string;
  change: number;
  positive?: boolean;
  spark: number[];
  icon: React.ComponentType<{ className?: string }>;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const up = change >= 0;
  const good = positive !== undefined ? (positive ? up : !up) : up;

  return (
    <div className="card-premium p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">{value}</p>
          <p className={cn("mt-1 flex items-center gap-0.5 text-xs font-semibold", good ? "text-emerald-600" : "text-red-500")}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change)}% {fr ? "vs période précédente" : "vs last period"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-xl bg-red-50 p-2">
            <Icon className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <Sparkline values={spark} color="var(--primary)" />
        </div>
      </div>
    </div>
  );
}

export type AnalyticsDateRange = {
  fromDate: string;
  toDate: string;
};

export const EMPTY_ANALYTICS_DATE_RANGE: AnalyticsDateRange = {
  fromDate: "",
  toDate: "",
};

export function PeriodFilter({
  period,
  onChange,
}: {
  period: AnalyticsPeriod;
  onChange: (p: AnalyticsPeriod) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-200 p-0.5">
      {ANALYTICS_PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
            period === p ? "bg-[var(--primary)] text-white" : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsDateRangeFilter({
  values,
  onChange,
}: {
  values: AnalyticsDateRange;
  onChange: (values: AnalyticsDateRange) => void;
}) {
  const { locale } = useLocale();
  const isFr = locale === "fr";

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[140px]">
        <label htmlFor="analytics-from-date" className="mb-1 block text-xs font-medium text-[var(--primary-dark)]">
          {isFr ? "Date de début" : "From date"}
        </label>
        <input
          id="analytics-from-date"
          type="date"
          className="input-premium w-full px-3 py-1.5 text-sm"
          value={values.fromDate}
          onChange={(e) => onChange({ ...values, fromDate: e.target.value })}
        />
      </div>
      <div className="min-w-[140px]">
        <label htmlFor="analytics-to-date" className="mb-1 block text-xs font-medium text-[var(--primary-dark)]">
          {isFr ? "Date de fin" : "To date"}
        </label>
        <input
          id="analytics-to-date"
          type="date"
          className="input-premium w-full px-3 py-1.5 text-sm"
          value={values.toDate}
          onChange={(e) => onChange({ ...values, toDate: e.target.value })}
        />
      </div>
      {(values.fromDate || values.toDate) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_ANALYTICS_DATE_RANGE)}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-red-50"
        >
          {isFr ? "Effacer" : "Clear"}
        </button>
      )}
    </div>
  );
}

export function AnalyticsPeriodControls({
  period,
  onPeriodChange,
  dateRange,
  onDateRangeChange,
}: {
  period: AnalyticsPeriod;
  onPeriodChange: (p: AnalyticsPeriod) => void;
  dateRange: AnalyticsDateRange;
  onDateRangeChange: (range: AnalyticsDateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-end gap-3">
      <PeriodFilter period={period} onChange={onPeriodChange} />
      <AnalyticsDateRangeFilter values={dateRange} onChange={onDateRangeChange} />
    </div>
  );
}
