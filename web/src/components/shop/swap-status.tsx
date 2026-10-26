"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { StepList } from "@/components/shop/step-list";
import { SWAP_STATUS, swapSteps, type ExchangeRow, type ReplacementRow } from "@/lib/after-sale";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { pickText } from "@/lib/i18n-fields";

export function SwapNotFound({ loaded }: { loaded: boolean }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="space-y-3 py-12 text-center text-slate-500">
      <p>{loaded ? (fr ? "Demande introuvable" : "Request not found") : fr ? "Chargement…" : "Loading…"}</p>
      <Link href="/shop/returns" className="text-[var(--primary)] hover:underline">{fr ? "Toutes mes demandes" : "All my requests"}</Link>
    </div>
  );
}

/** Status page of one replacement. */
export function ReplacementStatusView({ r }: { r: ReplacementRow }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const steps = swapSteps(r, fr);
  const status = SWAP_STATUS[r.status];
  return (
    <div className="space-y-6">
      <PageHeader
        title={r.reference}
        subtitle={`${fr ? "Commande" : "Order"} ${r.orderReference} · ${fr ? "Remplacement" : "Replacement"}`}
        backHref="/shop/returns"
        actions={<Badge variant={r.status === "delivered" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{fr ? status?.fr : status?.en}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Avancement" : "Progress"}>
          <StepList steps={steps} fr={fr} />
          {r.status !== "rejected" && r.status !== "delivered" && r.sellerDueAt && r.status === "requested" && (
            <p className="mt-2 text-xs text-slate-500">{fr ? "Réponse du vendeur attendue avant le" : "The seller should answer by"} {new Date(r.sellerDueAt).toLocaleString(fr ? "fr-FR" : "en-GB")}</p>
          )}
        </DetailSection>
        <DetailSection title={fr ? "Détails" : "Details"}>
          <InfoGrid items={[
            { label: fr ? "Article" : "Item", value: `${pickText(fr, r.productName, r.productNameFr)} × ${r.qty}` },
            ...(r.variant && r.variant !== "Default" ? [{ label: fr ? "Option" : "Option", value: r.variant }] : []),
            { label: fr ? "Demandé le" : "Requested", value: new Date(r.createdAt).toLocaleString(fr ? "fr-FR" : "en-GB") },
            ...(r.condition ? [{ label: fr ? "État" : "Condition", value: r.condition }] : []),
            ...(r.reason ? [{ label: fr ? "Motif" : "Reason", value: r.reason, full: true }] : []),
            ...(r.sellerReason ? [{ label: fr ? "Réponse du vendeur" : "Seller's answer", value: r.sellerReason, full: true }] : []),
            ...(r.status === "dispatched" ? [{ label: fr ? "Livraison" : "Delivery", value: fr ? "Un livreur vous apporte le nouvel article et reprend l'ancien." : "A rider is bringing the new item and will collect the old one.", full: true }] : []),
          ]} />
          <Link href={`/shop/orders/${r.orderId}`} className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">{fr ? "Voir la commande →" : "View order →"}</Link>
        </DetailSection>
      </div>
    </div>
  );
}

/** Status page of one exchange. */
export function ExchangeStatusView({ r }: { r: ExchangeRow }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const steps = swapSteps(r, fr);
  const status = SWAP_STATUS[r.status];
  const diff = r.priceDiffUsd;
  return (
    <div className="space-y-6">
      <PageHeader
        title={r.reference}
        subtitle={`${fr ? "Commande" : "Order"} ${r.orderReference} · ${fr ? "Échange" : "Exchange"}`}
        backHref="/shop/returns"
        actions={<Badge variant={r.status === "delivered" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{fr ? status?.fr : status?.en}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Avancement" : "Progress"}>
          <StepList steps={steps} fr={fr} />
        </DetailSection>
        <DetailSection title={fr ? "Détails" : "Details"}>
          <InfoGrid items={[
            { label: fr ? "Article rendu" : "Item you return", value: `${pickText(fr, r.fromName, r.fromNameFr)}${r.fromVariant && r.fromVariant !== "Default" ? ` (${r.fromVariant})` : ""} × ${r.qty}` },
            { label: fr ? "Article reçu" : "Item you get", value: `${pickText(fr, r.toName, r.toNameFr)}${r.toVariant ? ` (${r.toVariant})` : ""}` },
            {
              label: fr ? "Différence de prix" : "Price difference",
              value:
                diff === 0 ? (fr ? "Aucune" : "None") : diff > 0 ? (
                  <span>{fr ? "À payer" : "You pay"} {formatCurrency(diff, locale)}</span>
                ) : (
                  <span className="text-emerald-700">{fr ? "Remboursé" : "Refunded"} {formatCurrency(-diff, locale)}</span>
                ),
              full: true,
            },
            ...(diff > 0 ? [{ label: fr ? "Portefeuille" : "Wallet", value: r.status === "rejected" ? (fr ? "Montant retenu rendu à votre portefeuille." : "The held amount went back to your wallet.") : fr ? `${formatCurrency(r.heldUsd, locale)} retenus sur votre portefeuille à la demande.` : `${formatCurrency(r.heldUsd, locale)} held from your wallet when you asked.`, full: true }] : []),
            ...(diff < 0 ? [{ label: fr ? "Portefeuille" : "Wallet", value: r.status === "delivered" ? (fr ? "Remboursé sur votre portefeuille à la livraison." : "Refunded to your wallet on delivery.") : fr ? "Remboursé sur votre portefeuille à la livraison." : "Refunded to your wallet when delivered.", full: true }] : []),
            ...(r.reason ? [{ label: fr ? "Motif" : "Reason", value: r.reason, full: true }] : []),
            ...(r.sellerReason ? [{ label: fr ? "Réponse du vendeur" : "Seller's answer", value: r.sellerReason, full: true }] : []),
          ]} />
          <Link href={`/shop/orders/${r.orderId}`} className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">{fr ? "Voir la commande →" : "View order →"}</Link>
        </DetailSection>
      </div>
    </div>
  );
}
