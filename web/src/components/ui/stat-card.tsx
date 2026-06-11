import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  className,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  className?: string;
}) {
  return (
    <div className={cn("card-premium group p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-500">{title}</p>
          <p className="money-value mt-2 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            {value}
          </p>
          {trend && (
            <p className="mt-2 truncate text-xs font-medium text-emerald-600">{trend}</p>
          )}
        </div>
        <div className="shrink-0 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-3.5 transition-transform group-hover:scale-105">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
      </div>
    </div>
  );
}
