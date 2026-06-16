"use client";

import { useId } from "react";
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

const spinnerConfig: Record<
  LoaderSize,
  { dim: number; stroke: number; r: number; duration: string }
> = {
  sm: { dim: 20, stroke: 2.5, r: 7.25, duration: "0.75s" },
  md: { dim: 36, stroke: 3, r: 14, duration: "0.8s" },
  lg: { dim: 48, stroke: 3.5, r: 19, duration: "0.85s" },
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

function BrandedSpinner({ size = "md" }: { size?: LoaderSize }) {
  const uid = useId().replace(/:/g, "");
  const gradientId = `somba-spinner-${uid}`;
  const { dim, stroke, r, duration } = spinnerConfig[size];
  const center = dim / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.62;

  return (
    <svg
      width={dim}
      height={dim}
      viewBox={`0 0 ${dim} ${dim}`}
      className="animate-spin"
      style={{ animationDuration: duration }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="50%" stopColor="var(--brand-red)" />
          <stop offset="100%" stopColor="var(--logo-primary)" />
        </linearGradient>
      </defs>
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${arc} ${circumference - arc}`}
      />
    </svg>
  );
}

/** Branded Somba spinner — red-to-blue gradient arc, no background track. */
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
      <BrandedSpinner size={size} />
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
        "absolute inset-0 z-50 flex items-center justify-center rounded-[inherit] bg-white/70 backdrop-blur-[1px]",
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
