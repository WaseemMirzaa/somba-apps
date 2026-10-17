"use client";

import { cn } from "@/lib/utils";

export const PERIOD_DAYS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_DAYS)[number];

/** 7 / 30 / 90 day switch; the number is sent to the server as `days`. */
export function PeriodTabs({ value, onChange }: { value: PeriodDays; onChange: (d: PeriodDays) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Period">
      {PERIOD_DAYS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
            value === d ? "bg-[var(--primary)] text-white" : "text-slate-600 hover:bg-slate-50",
          )}
        >
          {d}D
        </button>
      ))}
    </div>
  );
}
