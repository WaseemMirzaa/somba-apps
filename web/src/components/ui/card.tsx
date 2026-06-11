import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("card-premium overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("border-b border-[var(--border)] px-6 py-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("px-6 py-5", className)} {...props}>
      {children}
    </div>
  );
}
