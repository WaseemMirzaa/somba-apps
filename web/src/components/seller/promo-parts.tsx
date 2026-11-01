"use client";

import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import type { SellerCampaign } from "@/lib/seller-promo";

/** Budget used so far: `spentUsd` of `budgetUsd`, with a bar. No budget set = nothing to enforce. */
export function BudgetBar({ campaign, className = "" }: { campaign: Pick<SellerCampaign, "budgetUsd" | "spentUsd" | "budgetRemainingUsd">; className?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  if (!(campaign.budgetUsd > 0)) {
    return <span className={`text-xs text-slate-500 ${className}`}>{fr ? "Sans budget" : "No budget set"}</span>;
  }
  const pct = Math.min(100, Math.round((campaign.spentUsd / campaign.budgetUsd) * 100));
  const tone = pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className={`min-w-[8rem] space-y-1 ${className}`}>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={fr ? "Budget utilisé" : "Budget used"}>
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-600">
        {formatCurrency(campaign.spentUsd, locale)} / {formatCurrency(campaign.budgetUsd, locale)}
        {campaign.budgetRemainingUsd !== null && (
          <span className="text-slate-400"> · {fr ? `reste ${formatCurrency(campaign.budgetRemainingUsd, locale)}` : `${formatCurrency(campaign.budgetRemainingUsd, locale)} left`}</span>
        )}
      </p>
    </div>
  );
}
