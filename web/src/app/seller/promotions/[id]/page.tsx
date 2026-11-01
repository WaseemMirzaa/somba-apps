"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useToast } from "@/context/toast-context";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { CampaignEffectTable, campaignApplies } from "@/components/seller/campaign-effect";
import { BudgetBar } from "@/components/seller/promo-parts";
import { Countdown } from "@/components/seller/countdown";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { EDITABLE_CAMPAIGN, useSellerAccess, useSellerData } from "@/lib/seller";
import { campaignStatusLabel, campaignStatusVariant, errMessage } from "@/lib/seller-labels";
import { campaignActions, campaignTitle, ctr, endedReasonText, roi, useCampaigns } from "@/lib/seller-promo";
import { localDay } from "@/lib/dates";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerPromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { sellerProductList, commissionPct } = useSellerData();
  const access = useSellerAccess();
  const canEdit = access.can("catalog") && !access.suspended;
  const campaigns = useCampaigns();
  const { toast } = useToast();
  const promo = campaigns.data?.find((c) => c.id === id || c.reference === id) ?? null;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    if (!promo) return;
    setBusy(true);
    setError(null);
    try {
      await campaignActions.withdraw(promo.id);
      toast(fr ? "Campagne retirée : les prix reviennent à la normale" : "Campaign withdrawn: prices are back to normal");
      setConfirming(false);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!promo) return;
    setBusy(true);
    try {
      await campaignActions.submit(promo.id);
      toast(fr ? "Campagne envoyée au marketing" : "Campaign sent to marketing");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!promo) {
    if (campaigns.error) return <LoadError message={campaigns.error} onRetry={campaigns.reload} />;
    if (campaigns.loading) return <SectionLoader />;
    return <EmptyState>{fr ? "Campagne introuvable" : "Campaign not found"}</EmptyState>;
  }

  const ids = promo.productIds ?? [];
  const wholeStore = ids.length === 0;
  const covered = wholeStore ? sellerProductList.filter((p) => p.status !== "rejected") : sellerProductList.filter((p) => ids.includes(p.id));
  const applies = campaignApplies({ status: promo.status, discount: promo.discount, startDate: promo.startDate, endDate: promo.endDate });
  const title = campaignTitle(promo, fr);
  const clickRate = ctr(promo);
  const returnOnBudget = roi(promo);

  const note: Record<string, [string, string]> = {
    pending: ["Waiting for marketing approval. Prices do not change until it is approved.", "En attente d'approbation par le marketing. Les prix ne changent pas avant."],
    draft: ["Draft: marketing has not seen it yet and prices are not affected. Submit it when you are ready.", "Brouillon : le marketing ne l'a pas encore vue et les prix ne sont pas modifiés. Soumettez-la quand vous êtes prêt."],
    rejected: ["Rejected by marketing: prices are not affected. Fix what they asked, then submit it again.", "Refusée par le marketing : les prix ne sont pas modifiés. Corrigez ce qui est demandé, puis soumettez-la à nouveau."],
    ended: ["Ended: prices are back to normal.", "Terminée : les prix sont revenus à la normale."],
    scheduled: ["Approved and scheduled. The discount starts on its start date.", "Approuvée et planifiée. La remise démarre à la date de début."],
    active: ["Approved and inside its dates.", "Approuvée et dans ses dates."],
  };
  const text = applies
    ? (fr ? "En cours : les clients paient déjà les prix remisés ci-dessous." : "Running: shoppers already pay the discounted prices below.")
    : (note[promo.status]?.[fr ? 1 : 0] ?? "");
  const endedWhy = promo.status === "ended" ? endedReasonText(promo.endedReason, fr) : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={`${promo.reference} · ${promo.discount}% ${fr ? "de remise" : "off"}`}
        backHref="/seller/promotions"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={campaignStatusVariant(promo.status)}>{campaignStatusLabel(promo.status, fr)}</Badge>
            {promo.status === "scheduled" && promo.startDate && <Countdown until={promo.startDate} />}
            {promo.status === "active" && promo.endDate && <Countdown until={/^\d{4}-\d{2}-\d{2}$/.test(promo.endDate) ? `${promo.endDate}T23:59:59Z` : promo.endDate} />}
            {canEdit && (promo.status === "draft" || promo.status === "rejected") && (
              <Button size="sm" variant="approve" disabled={busy} onClick={() => void submit()}>
                {fr ? "Soumettre au marketing" : "Submit to marketing"}
              </Button>
            )}
            {canEdit && EDITABLE_CAMPAIGN.includes(promo.status) && (
              <Link href={`/seller/promotions/${promo.id}/edit`}>
                <Button size="sm" variant="secondary">{fr ? "Modifier" : "Edit"}</Button>
              </Link>
            )}
            {canEdit && promo.status !== "ended" && (
              <Button size="sm" variant="danger" onClick={() => { setError(null); setConfirming(true); }}>
                {fr ? "Retirer" : "Withdraw"}
              </Button>
            )}
          </div>
        }
      />

      <Modal
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title={fr ? "Retirer cette campagne ?" : "Withdraw this campaign?"}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" variant="danger" onClick={() => void withdraw()} disabled={busy}>{busy ? "…" : fr ? "Retirer" : "Withdraw"}</Button>
          </>
        }
      >
        <p className="text-slate-600">
          {fr
            ? "La campagne se termine maintenant. Si elle était en cours, les clients repayent aussitôt le prix normal. Cette action est définitive."
            : "The campaign ends now. If it was running, shoppers pay the normal price again straight away. This cannot be undone."}
        </p>
        <ErrorNote message={error} />
      </Modal>

      {promo.status === "rejected" && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="campaign-reject-reason">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{fr ? "Motif du refus par le marketing" : "Why marketing rejected it"}</p>
            <p className="mt-0.5 whitespace-pre-line break-words">{promo.rejectReason || (fr ? "Aucun motif n'a été indiqué." : "No reason was given.")}</p>
          </div>
        </div>
      )}

      <div className={`rounded-xl border px-4 py-3 text-sm ${applies ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`} data-testid="campaign-note">
        {text} {endedWhy}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid items={[
            { label: fr ? "Nom de la campagne" : "Campaign Name", value: title },
            { label: fr ? "Statut" : "Status", value: campaignStatusLabel(promo.status, fr) },
            { label: fr ? "Produits" : "Products", value: wholeStore ? (fr ? "Toute la boutique" : "Whole store") : promo.productCount },
            { label: fr ? "Remise" : "Discount", value: `${promo.discount}%` },
            { label: fr ? "Période" : "Period", value: `${promo.startDate ? localDay(promo.startDate) : "—"} → ${promo.endDate ? localDay(promo.endDate) : "—"}` },
            { label: "Budget", value: <BudgetBar campaign={promo} />, full: true },
          ]} />
        </DetailSection>

        <DetailSection title={fr ? "Performance" : "Performance"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Vues" : "Views", value: promo.views },
            { label: fr ? "Clics" : "Clicks", value: promo.clicks },
            { label: fr ? "Taux de clic" : "Click rate", value: clickRate !== null ? `${clickRate}%` : "—" },
            { label: fr ? "Commandes" : "Orders", value: promo.orders },
            { label: fr ? "Revenu" : "Revenue", value: formatCurrency(promo.revenueUsd, locale) },
            { label: fr ? "ROI" : "ROI", value: returnOnBudget !== null ? `${returnOnBudget}x` : "—" },
          ]} />
          <p className="mt-3 text-xs text-slate-500">
            {fr
              ? "Les vues et clics comptent les clients qui voient ou ouvrent un produit de la campagne pendant qu'elle remise. Commandes et revenu comptent les ventes faites au prix de cette campagne."
              : "Views and clicks count shoppers who see or open a campaign product while it is discounting. Orders and revenue count the sales made at this campaign's price."}
          </p>
        </DetailSection>
      </div>

      <DetailSection title={fr ? "Effet sur les prix" : "Effect on prices"}>
        <CampaignEffectTable products={covered} discount={promo.discount} commissionPct={commissionPct} />
      </DetailSection>
    </div>
  );
}
