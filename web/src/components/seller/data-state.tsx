"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { useLocale } from "@/context/locale-context";
import { cn } from "@/lib/utils";
import { sellerErrorText } from "@/lib/seller-errors";

/** A failed read: the server's own message and a retry button. Never an endless spinner. */
export function LoadError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void | Promise<void>;
  className?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800",
        className,
      )}
    >
      <span className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">
          <strong>{fr ? "Impossible de charger ces données." : "Could not load this data."}</strong> {sellerErrorText(message, fr)}
        </span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={() => void onRetry()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {fr ? "Réessayer" : "Retry"}
        </button>
      )}
    </div>
  );
}

/** Inline loading state for a card or a whole page section. */
export function SectionLoader({ className }: { className?: string }) {
  const { locale } = useLocale();
  return (
    <div className={cn("flex items-center justify-center py-10", className)}>
      <Loader size="md" locale={locale} showLabel />
    </div>
  );
}

/** Nothing to show yet (a real, empty answer from the server). */
export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500", className)}>{children}</p>;
}

/**
 * What a detail page shows when the record is not in memory: the loader while
 * the first read is in flight, the server's error + retry if it failed, and
 * only then "not found".
 */
export function MissingRecord({
  load,
  label,
  labelFr,
}: {
  load: { loading: boolean; error: string | null; retry: () => void | Promise<void> };
  label: string;
  labelFr: string;
}) {
  const { locale } = useLocale();
  if (load.error) return <LoadError message={load.error} onRetry={load.retry} />;
  if (load.loading) return <SectionLoader />;
  return <EmptyState>{locale === "fr" ? labelFr : label}</EmptyState>;
}
