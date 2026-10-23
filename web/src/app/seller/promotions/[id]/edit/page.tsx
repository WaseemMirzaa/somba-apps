"use client";

import { useParams } from "next/navigation";
import { CampaignForm } from "@/components/seller/campaign-form";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { EDITABLE_CAMPAIGN, useSellerData } from "@/lib/seller";

export default function SellerPromotionEditPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { getPromotion, load } = useSellerData();
  const promo = getPromotion(id);

  if (!promo) {
    if (load.error) return <LoadError message={load.error} onRetry={load.retry} />;
    if (load.loading) return <SectionLoader />;
    return <EmptyState>{fr ? "Campagne introuvable" : "Campaign not found"}</EmptyState>;
  }
  if (!EDITABLE_CAMPAIGN.includes(promo.status)) {
    return (
      <EmptyState>
        {fr
          ? "Une campagne approuvée ou terminée ne peut plus être modifiée. Demandez au marketing de la changer, ou retirez-la."
          : "An approved or ended campaign can no longer be edited. Ask marketing to change it, or withdraw it."}
      </EmptyState>
    );
  }
  return (
    <CampaignForm
      key={promo.id}
      initial={{
        id: promo.id,
        name: promo.campaign,
        discount: promo.discount,
        startDate: promo.startDate === "—" ? null : promo.startDate,
        endDate: promo.endDate === "—" ? null : promo.endDate,
        budget: promo.budget,
        productIds: promo.productIds,
      }}
    />
  );
}
