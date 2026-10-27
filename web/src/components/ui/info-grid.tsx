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
  // Up to `columns` tracks, but never narrower than a readable minimum: the number of columns follows the width of
  // the card the grid sits in (not the viewport), so three short stat labels in a narrow card stack instead of colliding.
  const minCol = { 2: "11rem", 3: "8.5rem", 4: "7.5rem" }[columns];
  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fit, minmax(max(${minCol}, calc((100% - ${(columns - 1) * 1}rem) / ${columns})), 1fr))`,
  };
  return (
    <dl className={cn("grid gap-4", className)} style={gridStyle}>
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.full && "col-span-full")}>
          <dt className="break-words text-xs font-medium uppercase tracking-wide text-slate-400">
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
