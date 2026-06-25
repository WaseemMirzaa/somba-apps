import { cn } from "@/lib/utils";

const variants = {
  primary: "btn-primary text-white shadow-md hover:shadow-lg",
  secondary: "bg-white border border-[var(--border-strong)] text-slate-700 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  outline: "border-2 border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-light)]",
  // Outlined "decision" buttons: green for positive (approve/accept/authorise),
  // red for negative (reject/decline). Neutral border + coloured label, so they
  // read as outlined pills inside the mobile .row-actions footer and as outlined
  // buttons on desktop — never solid red.
  approve: "bg-white border border-[var(--border-strong)] text-emerald-600 hover:bg-emerald-50 shadow-sm",
  reject: "bg-white border border-[var(--border-strong)] text-red-600 hover:bg-red-50 shadow-sm",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-5 py-2.5 text-sm rounded-xl",
  lg: "px-7 py-3.5 text-base rounded-xl",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
