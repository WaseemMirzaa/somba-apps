"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  label: string;
  /** Date / detail under the label. */
  hint?: string;
  state: "done" | "current" | "todo" | "failed";
}

/** A horizontal progress track (wraps on a phone) for the life of a return, replacement or exchange. */
export function StepTrack({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-3">
      {steps.map((s, i) => (
        <li key={`${s.label}-${i}`} className="flex min-w-[8rem] flex-1 items-start gap-2">
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
              s.state === "done" && "bg-emerald-600 text-white",
              s.state === "current" && "bg-[var(--primary)] text-white ring-4 ring-red-100",
              s.state === "failed" && "bg-red-600 text-white",
              s.state === "todo" && "bg-slate-200 text-slate-500",
            )}
            aria-hidden="true"
          >
            {s.state === "done" ? <Check className="h-3 w-3" /> : s.state === "failed" ? "!" : i + 1}
          </span>
          <span className="min-w-0">
            <span className={cn("block text-sm", s.state === "todo" ? "text-slate-400" : "font-semibold text-slate-900")}>{s.label}</span>
            {s.hint && <span className="block text-xs text-slate-500">{s.hint}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
