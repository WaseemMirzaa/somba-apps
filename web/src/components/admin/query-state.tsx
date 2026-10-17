"use client";

import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { useLocale } from "@/context/locale-context";

/** Spinner shown while a section waits for its first server answer. */
export function SectionLoading({ className }: { className?: string }) {
  const { locale } = useLocale();
  return (
    <div className={`flex min-h-[8rem] items-center justify-center py-8 ${className ?? ""}`}>
      <Loader size="md" showLabel locale={locale === "fr" ? "fr" : "en"} />
    </div>
  );
}

/** The server's own error message plus a retry button. Never silent. */
export function SectionError({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 ${className ?? ""}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          {fr ? "Réessayer" : "Retry"}
        </Button>
      )}
    </div>
  );
}

/** Friendly empty state for a card or list. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

/** Shown to a signed-in admin whose role may not open a page (e.g. operations on Finance). */
export function NoAccess({ title, detail }: { title?: string; detail?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div role="alert" className="mx-auto mt-8 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Lock className="h-5 w-5 text-slate-500" />
      </div>
      <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">
        {title ?? (fr ? "Accès non autorisé" : "You do not have access")}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        {detail ?? (fr ? "Votre rôle n'a pas la permission d'ouvrir cette page." : "Your role is not allowed to open this page.")}
      </p>
    </div>
  );
}
