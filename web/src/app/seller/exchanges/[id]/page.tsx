"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { formatCurrency } from "@/lib/utils";
import { exchangeStatusLabel, exchangeStatusVariant } from "@/lib/seller-labels";

export default function SellerExchangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { getSellerExchange, load } = useSellerData();
  const x = getSellerExchange(id);

  if (!x) return <MissingRecord load={load} label="Exchange not found" labelFr="Échange introuvable" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={x.id}
        subtitle={`${x.date} · ${exchangeStatusLabel(x.status, fr)} · ${x.orderId}`}
        backHref="/seller/exchanges"
        actions={<Badge variant={exchangeStatusVariant(x.status)}>{exchangeStatusLabel(x.status, fr)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"} span={2}>
          <InfoGrid
            items={[
              { label: fr ? "Commande" : "Order", value: <Link href={`/seller/orders/${x.orderId}`} className="text-[var(--primary)] hover:underline">{x.orderId}</Link> },
              { label: t("customer"), value: x.customer },
              { label: fr ? "Article rendu" : "Item returned", value: `${x.fromName} · ${x.fromSku}` },
              { label: fr ? "Article souhaité" : "Item wanted", value: `${x.toName} · ${x.toSku}` },
              { label: fr ? "Écart de prix" : "Price difference", value: formatCurrency(x.priceDiffUsd) },
              { label: fr ? "Motif" : "Reason", value: x.reason || "—", full: true },
            ]}
          />
        </DetailGridSection>
      </DetailGrid>
      <p className="text-xs text-slate-500">
        {fr
          ? "L'entrepôt reçoit l'article, prépare le nouveau et l'expédie. Vous recevez une notification à chaque étape."
          : "The warehouse receives the item, prepares the new one and sends it. You get a notification at each step."}
      </p>
    </div>
  );
}
