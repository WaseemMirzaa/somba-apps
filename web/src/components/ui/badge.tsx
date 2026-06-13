import { cn } from "@/lib/utils";

const variants = {
  default: "bg-slate-100 text-slate-700",
  muted: "bg-slate-50 text-slate-400",
  primary: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-100",
  purple: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  info: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
