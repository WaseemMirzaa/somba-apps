"use client";

import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";

export interface DayPoint {
  label: string;
  revenue: number;
  orders: number;
}

/**
 * Revenue bars with an orders marker per day. Every bar carries a tooltip with
 * the exact figures, so a quiet day is readable too.
 */
export function RevenueOrdersChart({ data, height = 240 }: { data: readonly DayPoint[]; height?: number }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const maxRev = Math.max(...data.map((d) => d.revenue), 1);
  const maxOrd = Math.max(...data.map((d) => d.orders), 1);

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-[3px]" style={{ height }}>
        {data.map((d) => (
          <div
            key={d.label}
            className="group relative flex min-w-0 flex-1 flex-col justify-end"
            title={`${d.label}: ${formatCurrency(d.revenue, locale)} · ${d.orders} ${fr ? "commande(s)" : "order(s)"}`}
          >
            {d.orders > 0 && (
              <span
                className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--primary)] ring-2 ring-white"
                style={{ bottom: `calc(${(d.orders / maxOrd) * 85}% + 2px)` }}
              />
            )}
            <div
              className="w-full rounded-t-md bg-blue-200 transition-colors group-hover:bg-blue-300"
              style={{ height: d.revenue > 0 ? `${Math.max((d.revenue / maxRev) * 100, 3)}%` : "2px", opacity: d.revenue > 0 ? 1 : 0.4 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-200" /> {fr ? "Chiffre d'affaires" : "Revenue"}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--primary)]" /> {fr ? "Commandes" : "Orders"}</span>
      </div>
    </div>
  );
}
