"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useLocale } from "@/context/locale-context";

export default function SellerTaxPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Rapports fiscaux" : "Tax Reports"} subtitle={fr ? "N° fiscal : CD-123456789" : "Tax ID: CD-123456789"} backHref="/seller/finance" />
      <DetailSection title={fr ? "Rapports fiscaux" : "Tax Reports"}>
        <p className="text-sm text-slate-500">{fr ? "Les rapports fiscaux trimestriels apparaîtront ici." : "Quarterly tax reports will appear here."}</p>
      </DetailSection>
    </div>
  );
}
