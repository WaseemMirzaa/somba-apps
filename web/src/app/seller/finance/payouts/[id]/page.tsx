"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { Badge } from "@/components/ui/badge";
import { useSellerData } from "@/lib/seller";
import { payoutMethodLabel, payoutStatusLabel, payoutStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";

export default function SellerPayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { getPayout, load } = useSellerData();
  const payout = getPayout(id);

  if (!payout) return <MissingRecord load={load} label="Payout not found" labelFr="Versement introuvable" />;

  const label = payoutStatusLabel(payout.status, fr);

  return (
    <div className="space-y-6">
      <PageHeader
        title={payout.id}
        subtitle={`${formatCurrency(payout.amount, locale)} · ${label}`}
        backHref="/seller/finance/payouts"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("finance"), href: "/seller/finance" },
          { label: t("payouts"), href: "/seller/finance/payouts" },
          { label: payout.id },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <NavLinkButton href="/seller/finance/payouts/pending">
              {fr ? "Gains par commande" : "Earnings per order"}
            </NavLinkButton>
            <Badge variant={payoutStatusVariant(payout.status)}>{label}</Badge>
          </div>
        }
      />

      <DetailSection title={fr ? "Détails du versement" : "Payout Details"}>
        <InfoGrid
          items={[
            { label: fr ? "Référence" : "Reference", value: payout.id },
            { label: t("amount"), value: formatCurrency(payout.amount, locale) },
            { label: fr ? "Méthode" : "Method", value: payoutMethodLabel(payout.methodKey, fr) },
            { label: fr ? "Compte de destination" : "Destination account", value: payout.account || (payout.methodKey === "wallet" ? (fr ? "Portefeuille Somba" : "Somba wallet") : "—") },
            { label: t("status"), value: label },
            { label: t("date"), value: payout.date },
            {
              label: fr ? "Réf. du virement" : "Transfer reference",
              value: payout.status === "paid" ? payout.providerRef || (payout.methodKey === "wallet" ? (fr ? "Crédit portefeuille" : "Wallet credit") : "—") : fr ? "Renseignée au paiement" : "Shown once paid",
            },
            ...(payout.note ? [{ label: fr ? "Note de la finance" : "Finance note", value: payout.note, full: true }] : []),
          ]}
        />
        {payout.status === "rejected" && (
          <p className="mt-4 text-sm text-red-700">
            {fr ? "Cette demande a été rejetée : les fonds restent disponibles. Consultez la note ci-dessus ou contactez le support." : "This request was rejected: the funds are available again. See the note above or contact support."}
          </p>
        )}
      </DetailSection>

      <p className="text-xs text-slate-500">
        {fr
          ? "Les versements sont prélevés sur votre solde global ; ils ne sont pas rattachés à des commandes précises."
          : "Payouts draw on your overall balance; they are not tied to individual orders."}
      </p>
    </div>
  );
}
