import { cn } from "@/lib/utils";
import { DetailSection } from "./info-grid";

/** Responsive grid for detail pages — all sections visible at once (no tabs). */
export function DetailGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>
      {children}
    </div>
  );
}

export function DetailGridSection({
  title,
  children,
  action,
  className,
  span = 1,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** 1 = single column, 2 = half row on md+, 3 = full width */
  span?: 1 | 2 | 3;
}) {
  return (
    <DetailSection
      title={title}
      action={action}
      className={cn(
        span === 2 && "md:col-span-2",
        span === 3 && "md:col-span-2 xl:col-span-3",
        className
      )}
    >
      {children}
    </DetailSection>
  );
}
