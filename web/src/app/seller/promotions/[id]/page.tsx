"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useSellerData } from "@/lib/seller";
import { campaignStatusLabel, campaignStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerPromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { getPromotion } = useSellerData();
  const promo = getPromotion(id);

  if (!promo) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Campagne introuvable" : "Campaign not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={promo.campaign}
        subtitle={`${promo.reference} · ${promo.discount}% ${fr ? "de remise" : "off"}`}
        backHref="/seller/promotions"
        actions={<Badge variant={campaignStatusVariant(promo.status)}>{campaignStatusLabel(promo.status, fr)}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid items={[
            { label: fr ? "Nom de la campagne" : "Campaign Name", value: promo.campaign },
            { label: fr ? "Statut" : "Status", value: campaignStatusLabel(promo.status, fr) },
            { label: fr ? "Budget" : "Budget", value: formatCurrency(promo.budget, locale) },
            { label: fr ? "Produits" : "Products", value: promo.products },
            { label: fr ? "Remise" : "Discount", value: `${promo.discount}%` },
            { label: fr ? "Période" : "Period", value: `${promo.startDate} → ${promo.endDate}` },
          ]} />
        </DetailSection>

        <DetailSection title={fr ? "Performance" : "Performance"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Vues" : "Views", value: promo.views.toLocaleString() },
            { label: fr ? "Clics" : "Clicks", value: promo.clicks },
            { label: fr ? "Commandes" : "Orders", value: promo.orders },
            { label: fr ? "Revenu" : "Revenue", value: formatCurrency(promo.revenue, locale) },
            { label: fr ? "ROI" : "ROI", value: promo.budget > 0 ? `${promo.roi}x` : "—" },
          ]} />
        </DetailSection>
      </div>
    </div>
  );
}
