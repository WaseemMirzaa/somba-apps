"use client";

import { cn } from "@/lib/utils";

type LoaderSize = "sm" | "md" | "lg";
type LoaderLocale = "en" | "fr";

export type LoaderProps = {
  size?: LoaderSize;
  className?: string;
  /** English loading text */
  label?: string;
  /** French loading text (falls back to label) */
  labelFr?: string;
  locale?: LoaderLocale;
  showLabel?: boolean;
};

const sizeRing: Record<LoaderSize, string> = {
  sm: "h-5 w-5 border-2",
  md: "h-9 w-9 border-[3px]",
  lg: "h-12 w-12 border-[3px]",
};

function resolveLabel(
  locale: LoaderLocale,
  label?: string,
  labelFr?: string,
  fallbackEn = "Loading…",
  fallbackFr = "Chargement…"
) {
  if (locale === "fr") return labelFr ?? label ?? fallbackFr;
  return label ?? fallbackEn;
}

/** Branded Somba spinner — red primary ring with logo blue accent. */
export function Loader({
  size = "md",
  className,
  label,
  labelFr,
  locale = "en",
  showLabel = false,
}: LoaderProps) {
  const text = resolveLabel(locale, label, labelFr);

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={cn("relative inline-flex shrink-0", sizeRing[size])}>
        <span
          className={cn(
            "absolute inset-0 rounded-full border-slate-100/90",
            sizeRing[size]
          )}
          aria-hidden
        />
        <span
          className={cn(
            "absolute inset-0 animate-spin rounded-full border-transparent border-t-[var(--primary)] border-r-[var(--logo-primary)]",
            sizeRing[size]
          )}
        />
      </span>
      {showLabel && (
        <p className="text-sm font-medium tracking-tight text-slate-500">{text}</p>
      )}
      <span className="sr-only">{text}</span>
    </div>
  );
}

/** Centered loader for page sections and auth guards. */
export function PageLoader({
  label,
  labelFr,
  locale = "en",
  className,
}: Omit<LoaderProps, "size" | "showLabel">) {
  return (
    <div className={cn("flex min-h-[40vh] w-full items-center justify-center px-4", className)}>
      <Loader size="lg" showLabel label={label} labelFr={labelFr} locale={locale} />
    </div>
  );
}

/** Full-viewport loader for login redirects and route transitions. */
export function FullPageLoader({
  label,
  labelFr,
  locale = "en",
  className,
}: Omit<LoaderProps, "size" | "showLabel">) {
  return (
    <div
      className={cn(
        "flex min-h-screen w-full items-center justify-center bg-[var(--background)] px-4",
        className
      )}
    >
      <Loader size="lg" showLabel label={label} labelFr={labelFr} locale={locale} />
    </div>
  );
}

/** Compact inline loader for buttons, cards, and list rows. */
export function InlineLoader({
  label,
  labelFr,
  locale = "en",
  className,
}: Omit<LoaderProps, "size">) {
  return (
    <Loader
      size="sm"
      showLabel={Boolean(label || labelFr)}
      label={label}
      labelFr={labelFr}
      locale={locale}
      className={cn("inline-flex flex-row gap-2", className)}
    />
  );
}

/** Semi-transparent overlay for in-place loading states. */
export function LoadingOverlay({
  label,
  labelFr,
  locale = "en",
  className,
}: Omit<LoaderProps, "size" | "showLabel">) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex items-center justify-center rounded-[inherit] bg-white/80 backdrop-blur-[2px]",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader size="md" showLabel label={label} labelFr={labelFr} locale={locale} />
    </div>
  );
}
