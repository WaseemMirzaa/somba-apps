import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/charts/dashboard-charts";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  title: string;
  value: string;
  change: number;
  positive?: boolean;
  spark: number[];
  icon: React.ComponentType<{ className?: string }>;
  changeSuffix?: string;
  iconBgClassName?: string;
  iconClassName?: string;
  sparkColor?: string;
  compact?: boolean;
};

export function KpiCard({
  title,
  value,
  change,
  positive,
  spark,
  icon: Icon,
  changeSuffix = "%",
  iconBgClassName = "bg-blue-50",
  iconClassName = "text-[var(--primary)]",
  sparkColor,
  compact = false,
}: KpiCardProps) {
  const up = change >= 0;
  const good = positive !== undefined ? (positive ? up : !up) : up;

  return (
    <div className={cn("card-premium", compact ? "p-4" : "p-5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-500">{title}</p>
          <p
            className={cn(
              "money-value mt-1 font-[family-name:var(--font-display)] font-bold leading-tight text-slate-900",
              compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"
            )}
          >
            {value}
          </p>
          <p
            className={cn(
              "mt-1 flex min-w-0 items-center gap-0.5 text-xs font-semibold",
              good ? "text-emerald-600" : "text-red-500"
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : <ArrowDownRight className="h-3 w-3 shrink-0" />}
            <span className="truncate">
              {Math.abs(change)}
              {changeSuffix}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className={cn("rounded-xl p-2", iconBgClassName)}>
            <Icon className={cn("h-4 w-4", iconClassName)} />
          </div>
          <Sparkline values={spark} color={sparkColor} />
        </div>
      </div>
    </div>
  );
}
