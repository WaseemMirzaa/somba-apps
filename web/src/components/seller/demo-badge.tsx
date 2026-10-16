"use client";

import { useLocale } from "@/context/locale-context";
import { cn } from "@/lib/utils";

/** Marks a widget whose numbers are illustrative: the server has no data for it yet. */
export function DemoBadge({ className }: { className?: string }) {
  const { locale } = useLocale();
  return (
    <span
      title={
        locale === "fr"
          ? "Données d'exemple : le serveur ne fournit pas encore cette information."
          : "Sample data: the server does not provide this information yet."
      }
      className={cn(
        "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200",
        className,
      )}
    >
      {locale === "fr" ? "Données démo" : "Demo data"}
    </span>
  );
}

/** A full-width notice for pages that are entirely sample data. */
export function DemoNotice({ className, all = false }: { className?: string; all?: boolean }) {
  const { locale } = useLocale();
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600", className)}>
      <DemoBadge />
      {all
        ? locale === "fr"
          ? "Toutes les valeurs de cette page sont des exemples : le serveur ne fournit pas encore ces statistiques."
          : "Every figure on this page is sample data: the server does not provide these statistics yet."
        : locale === "fr"
          ? "Les graphiques ci-dessous sont des exemples. Seul « Meilleures ventes » reflète vos vraies commandes."
          : "The charts below are samples. Only “Best sellers” reflects your real orders."}
    </div>
  );
}
