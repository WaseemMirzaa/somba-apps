"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { GoalProgress } from "@/components/charts/dashboard-charts";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { GOAL_METRICS, useSellerGoals, type SellerGoal } from "@/context/seller-goals-context";
import { useSellerData } from "@/lib/seller";
import { useSellerAnalytics } from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";

export function goalFormatter(kind: (typeof GOAL_METRICS)[number]["kind"], locale: string) {
  return kind === "currency"
    ? (n: number) => formatCurrency(n, locale)
    : kind === "percent"
      ? (n: number) => `${n}%`
      : kind === "rating"
        ? (n: number) => n.toFixed(1)
        : (n: number) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-US");
}

/** Dashboard card: each personal target against the live 30-day figure. */
export function GoalsCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { goals, goalsReady } = useSellerGoals();
  const a = useSellerAnalytics(30);
  const { sellerProductList } = useSellerData();
  const liveListings = sellerProductList.filter((p) => p.status === "live").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">{fr ? "Objectifs (30 jours)" : "Goals (last 30 days)"}</h2>
          <p className="text-xs text-slate-500">
            {fr ? "Vos cibles (enregistrées sur votre compte) contre vos chiffres réels" : "Your targets (saved on your account) against your real figures"}
          </p>
        </div>
        <NavLinkButton href="/seller/settings" className="shrink-0">{fr ? "Modifier" : "Edit"}</NavLinkButton>
      </CardHeader>
      <CardContent className="space-y-6">
        {!goalsReady || (a.loading && goals.length > 0) ? (
          <SectionLoader className="py-4" />
        ) : a.error && goals.length > 0 ? (
          <LoadError message={a.error} onRetry={a.retry} />
        ) : goals.length === 0 ? (
          <p className="text-sm text-slate-500">
            {fr ? "Aucun objectif défini. Ajoutez-en dans les paramètres." : "No goals yet. Add some in Settings."}
          </p>
        ) : (
          goals.map((g: SellerGoal) => {
            const meta = GOAL_METRICS.find((m) => m.value === g.metric)!;
            const current = a.data ? meta.current(a.data, { products: liveListings }) : null;
            return current === null ? (
              <div key={g.id} className="text-sm">
                <p className="text-xs font-medium text-slate-500">{fr ? meta.labelFr : meta.label}</p>
                <p className="mt-1 text-slate-500">{fr ? "Pas encore de données." : "No data yet."}</p>
              </div>
            ) : (
              <GoalProgress
                key={g.id}
                label={fr ? meta.labelFr : meta.label}
                current={current}
                target={g.target}
                format={goalFormatter(meta.kind, locale)}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
