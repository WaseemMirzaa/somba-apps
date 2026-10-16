/** Small marker for widgets that show illustrative (non-live) numbers. */
export function DemoBadge({ fr = false, label }: { fr?: boolean; label?: string }) {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
      {label ?? (fr ? "Données démo" : "Demo data")}
    </span>
  );
}

export function NoticeBar({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={
        tone === "warn"
          ? "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          : "rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800"
      }
    >
      {children}
    </div>
  );
}
