"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { CampaignEffectTable, campaignApplies } from "@/components/seller/campaign-effect";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { useSellerData } from "@/lib/seller";
import { campaignStatusLabel, campaignStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerPromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { getPromotion, sellerProductList, commissionPct, load } = useSellerData();
  const promo = getPromotion(id);

  if (!promo) {
    if (load.error) return <LoadError message={load.error} onRetry={load.retry} />;
    if (load.loading) return <SectionLoader />;
    return <EmptyState>{fr ? "Campagne introuvable" : "Campaign not found"}</EmptyState>;
  }

  const wholeStore = promo.productIds.length === 0;
  const covered = wholeStore ? sellerProductList.filter((p) => p.status !== "rejected") : sellerProductList.filter((p) => promo.productIds.includes(p.id));
  const applies = campaignApplies({ status: promo.status, discount: promo.discount, startDate: promo.startDate === "—" ? null : promo.startDate, endDate: promo.endDate === "—" ? null : promo.endDate });

  const note: Record<string, [string, string]> = {
    pending: ["Waiting for marketing approval. Prices do not change until it is approved.", "En attente d'approbation par le marketing. Les prix ne changent pas avant."],
    draft: ["Draft: prices are not affected.", "Brouillon : les prix ne sont pas modifiés."],
    rejected: ["Rejected by marketing: prices are not affected.", "Refusée par le marketing : les prix ne sont pas modifiés."],
    ended: ["Ended: prices are back to normal.", "Terminée : les prix sont revenus à la normale."],
    scheduled: ["Approved. The discount starts on its start date.", "Approuvée. La remise démarre à la date de début."],
    active: ["Approved and inside its dates.", "Approuvée et dans ses dates."],
  };
  const text = applies
    ? (fr ? "En cours : les clients paient déjà les prix remisés ci-dessous." : "Running: shoppers already pay the discounted prices below.")
    : (note[promo.status]?.[fr ? 1 : 0] ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        title={promo.campaign}
        subtitle={`${promo.reference} · ${promo.discount}% ${fr ? "de remise" : "off"}`}
        backHref="/seller/promotions"
        actions={<Badge variant={campaignStatusVariant(promo.status)}>{campaignStatusLabel(promo.status, fr)}</Badge>}
      />

      <div className={`rounded-xl border px-4 py-3 text-sm ${applies ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`} data-testid="campaign-note">
        {text}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid items={[
            { label: fr ? "Nom de la campagne" : "Campaign Name", value: promo.campaign },
            { label: fr ? "Statut" : "Status", value: campaignStatusLabel(promo.status, fr) },
            { label: fr ? "Budget" : "Budget", value: promo.budget > 0 ? formatCurrency(promo.budget, locale) : "—" },
            { label: fr ? "Produits" : "Products", value: wholeStore ? (fr ? "Toute la boutique" : "Whole store") : promo.products },
            { label: fr ? "Remise" : "Discount", value: `${promo.discount}%` },
            { label: fr ? "Période" : "Period", value: `${promo.startDate} → ${promo.endDate}` },
          ]} />
        </DetailSection>

        <DetailSection title={fr ? "Performance" : "Performance"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Commandes" : "Orders", value: promo.orders },
            { label: fr ? "Revenu" : "Revenue", value: formatCurrency(promo.revenue, locale) },
            { label: fr ? "ROI" : "ROI", value: promo.budget > 0 ? `${promo.roi}x` : "—" },
          ]} />
          <p className="mt-3 text-xs text-slate-500">
            {fr ? "Commandes et revenu comptent les ventes faites au prix de cette campagne." : "Orders and revenue count the sales made at this campaign's price."}
          </p>
        </DetailSection>
      </div>

      <DetailSection title={fr ? "Effet sur les prix" : "Effect on prices"}>
        <CampaignEffectTable products={covered} discount={promo.discount} commissionPct={commissionPct} />
      </DetailSection>
    </div>
  );
}
