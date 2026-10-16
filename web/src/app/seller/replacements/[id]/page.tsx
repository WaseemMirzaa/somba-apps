"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { replacementStatusLabelReal, replacementStatusVariantReal } from "@/lib/seller-labels";

export default function SellerReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { getSellerReplacement } = useSellerData();
  const rep = getSellerReplacement(id);

  if (!rep) {
    return (
      <div className="p-8 text-center text-slate-500">
        {fr ? "Remplacement introuvable" : "Replacement not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={rep.id}
        subtitle={`${rep.date} · ${replacementStatusLabelReal(rep.status, fr)} · ${rep.orderId}`}
        backHref="/seller/replacements"
        actions={<Badge variant={replacementStatusVariantReal(rep.status)}>{replacementStatusLabelReal(rep.status, fr)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"} span={2}>
          <InfoGrid
            items={[
              { label: fr ? "ID remplacement" : "Replacement ID", value: rep.id },
              { label: fr ? "Commande" : "Order", value: <Link href={`/seller/orders/${rep.orderId}`} className="text-[var(--primary)] hover:underline">{rep.orderId}</Link> },
              { label: t("customer"), value: rep.customer },
              { label: fr ? "Produit" : "Product", value: rep.productName },
              { label: "SKU", value: rep.sku },
              { label: fr ? "Condition" : "Condition", value: rep.condition || "—" },
              { label: fr ? "Motif" : "Reason", value: rep.reason || "—", full: true },
            ]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
