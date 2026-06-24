import { cn } from "@/lib/utils";

export function InfoGrid({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: React.ReactNode; full?: boolean }[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const colClass = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };
  return (
    <dl className={cn("grid gap-4", colClass[columns], className)}>
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.full && "sm:col-span-full")}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-sm font-medium text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailSection({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-premium p-6", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
