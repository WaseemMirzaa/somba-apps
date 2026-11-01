"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EngageReviews } from "@/components/seller/engage-reviews";
import { SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";

export default function SellerReviewsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reviews")}
        subtitle={fr ? "Avis clients sur vos produits : répondez publiquement ou signalez un avis abusif" : "Customer reviews on your products: reply publicly or report an abusive one"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("reviews") }]}
      />
      <Suspense fallback={<SectionLoader />}>
        <EngageReviews />
      </Suspense>
    </div>
  );
}
