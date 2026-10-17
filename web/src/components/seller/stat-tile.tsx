"use client";

import { Sparkline } from "@/components/charts/dashboard-charts";

/** A KPI tile showing one real figure, an optional plain-language hint and an optional sparkline. */
export function StatTile({
  title,
  value,
  hint,
  spark,
  icon: Icon,
}: {
  title: string;
  value: string;
  /** Plain-language context under the value (never an invented trend). */
  hint?: string;
  spark?: number[];
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="card-premium p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 truncate font-[family-name:var(--font-display)] text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        <div className="grid justify-items-end gap-2">
          <div className="rounded-xl bg-blue-50 p-2">
            <Icon className="h-4 w-4 text-[var(--primary)]" />
          </div>
          {spark && spark.length > 1 && (
            <div className="hidden lg:block">
              <Sparkline values={spark} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
