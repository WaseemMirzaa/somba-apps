"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MarketingHeader } from "@/components/landing/marketing-header";
import { MarketingFooter } from "@/components/landing/marketing-footer";
import { PlanCheckout } from "@/components/seller/plan-checkout";
import { useLocale } from "@/context/locale-context";

function SubscribeContent() {
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const fr = locale === "fr";
  // Old links used "professional"; the plan id on the server is "pro".
  const raw = searchParams.get("plan");
  const preselect = raw === "professional" ? "pro" : raw;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <MarketingHeader />
      <div className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
        <div className="mb-8">
          <Link href="/sell-online#plans" className="text-sm font-medium text-[var(--primary)] hover:underline">
            ← {fr ? "Retour aux offres" : "Back to plans"}
          </Link>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold text-slate-900">
            {fr ? "Choisissez votre offre vendeur" : "Choose your seller plan"}
          </h1>
          <p className="mt-2 text-slate-600">
            {fr
              ? "Payez avec votre portefeuille Somba (activation immédiate) ou en Mobile Money (vous approuvez sur votre téléphone)."
              : "Pay with your Somba wallet (active immediately) or with Mobile Money (you approve on your phone)."}
          </p>
        </div>
        <PlanCheckout preselect={preselect} />
      </div>
      <MarketingFooter />
    </div>
  );
}

export default function SellOnlineSubscribePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">{fr ? "Chargement…" : "Loading…"}</div>}>
      <SubscribeContent />
    </Suspense>
  );
}
