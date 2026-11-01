import { Check, Circle, X } from "lucide-react";
import type { Step } from "@/lib/after-sale";

/** A vertical list of steps (done / current / to do / blocked) for returns, disputes, exchanges and journeys. */
export function StepList({ steps, fr }: { steps: Step[]; fr: boolean }) {
  return (
    <ol className="space-y-3" data-testid="step-list">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-3" data-state={s.state}>
          <div className="flex flex-col items-center">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
                s.state === "done" ? "bg-emerald-500" : s.state === "current" ? "bg-[var(--primary)] ring-4 ring-blue-100" : s.state === "bad" ? "bg-red-500" : "bg-slate-200 text-slate-400"
              }`}
            >
              {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : s.state === "bad" ? <X className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />}
            </span>
            {i < steps.length - 1 && <span className={`mt-1 w-px flex-1 ${s.state === "done" ? "bg-emerald-300" : "bg-slate-200"}`} />}
          </div>
          <div className="pb-3">
            <p className={`text-sm ${s.state === "todo" ? "text-slate-500" : "font-medium text-slate-900"}`}>{s.label}</p>
            {s.hint && <p className="mt-0.5 text-xs text-slate-600">{s.hint}</p>}
            {s.at && <p className="text-xs text-slate-500">{new Date(s.at).toLocaleString(fr ? "fr-FR" : "en-GB")}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
