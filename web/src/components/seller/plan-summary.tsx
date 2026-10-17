"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useSellerPlan } from "@/lib/seller";
import { cn } from "@/lib/utils";

export function planName(plan: { name: string; nameFr?: string } | null, id: string, fr: boolean): string {
  if (!plan) return id;
  return fr ? (plan.nameFr ?? plan.name) : plan.name;
}

export function formatDate(iso: string, fr: boolean): string {
  return new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The store's real subscription: plan in force, expiry and how much of the
 * listing quota (`maxProducts`) is used. All of it comes from the server.
 */
export function PlanSummary({ className }: { className?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { plan, planId, expiresAt, used, max, atLimit, loaded } = useSellerPlan();
  if (!loaded) return null;
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;

  return (
    <div className={cn("card-premium flex flex-wrap items-center gap-x-8 gap-y-3 p-4", className)}>
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-blue-50 p-2 text-[var(--primary)]">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-medium text-slate-500">{fr ? "Votre offre" : "Your plan"}</p>
          <p className="font-semibold text-slate-900" data-testid="plan-name">{planName(plan, planId, fr)}</p>
          <p className="text-xs text-slate-500">
            {expiresAt
              ? fr ? `Active jusqu'au ${formatDate(expiresAt, fr)}` : `Active until ${formatDate(expiresAt, fr)}`
              : planId === "free" ? (fr ? "Sans échéance" : "No expiry") : fr ? "Expirée" : "Expired"}
          </p>
        </div>
      </div>

      <div className="min-w-[200px] flex-1">
        <p className="text-xs font-medium text-slate-500">{fr ? "Annonces" : "Listings"}</p>
        {max ? (
          <>
            <p className="text-sm font-semibold text-slate-900" data-testid="plan-quota">
              {used} / {max}
              {atLimit && <span className="ml-2 text-xs font-medium text-amber-700">{fr ? "limite atteinte" : "limit reached"}</span>}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full", atLimit ? "bg-amber-500" : "bg-[var(--primary)]")} style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold text-slate-900" data-testid="plan-quota">
            {used} <span className="font-normal text-slate-500">{fr ? "· illimité avec cette offre" : "· unlimited on this plan"}</span>
          </p>
        )}
      </div>

      <Link href="/seller/subscribe" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        {atLimit ? (fr ? "Passer à une offre supérieure" : "Upgrade plan") : fr ? "Voir les offres" : "See plans"}
      </Link>
    </div>
  );
}
