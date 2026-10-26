"use client";

import { useParams } from "next/navigation";
import { CampaignForm } from "@/components/seller/campaign-form";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { EDITABLE_CAMPAIGN } from "@/lib/seller";
import { frInForm, pickText } from "@/lib/i18n-fields";
import { useCampaigns } from "@/lib/seller-promo";

export default function SellerPromotionEditPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const campaigns = useCampaigns();
  const promo = campaigns.data?.find((c) => c.id === id || c.reference === id) ?? null;

  if (!promo) {
    if (campaigns.error) return <LoadError message={campaigns.error} onRetry={campaigns.reload} />;
    if (campaigns.loading) return <SectionLoader />;
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
        status: promo.status,
        name: pickText(false, promo.name, promo.nameFr),
        nameFr: frInForm(promo.name, promo.nameFr),
        discount: promo.discount,
        startDate: promo.startDate,
        endDate: promo.endDate,
        budget: promo.budgetUsd,
        productIds: promo.productIds ?? [],
      }}
    />
  );
}
