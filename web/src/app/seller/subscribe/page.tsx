"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PlanCheckout } from "@/components/seller/plan-checkout";
import { PlanSummary } from "@/components/seller/plan-summary";
import { useLocale } from "@/context/locale-context";

function Content() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const raw = useSearchParams().get("plan");
  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Offres vendeur" : "Seller plans"}
        subtitle={fr ? "Votre offre, son échéance et le nombre d'annonces autorisées" : "Your plan, when it ends and how many listings it allows"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: fr ? "Offres" : "Plans" }]}
      />
      <PlanSummary />
      <PlanCheckout preselect={raw === "professional" ? "pro" : raw} />
    </div>
  );
}

export default function SellerSubscribePage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
