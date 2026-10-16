"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useLocale } from "@/context/locale-context";

export default function SellerTaxPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Rapports fiscaux" : "Tax Reports"} backHref="/seller/finance" />
      <DetailSection title={fr ? "Rapports fiscaux" : "Tax Reports"}>
        <p className="text-sm text-slate-500">
          {fr
            ? "Les rapports fiscaux ne sont pas encore générés par la plateforme. Utilisez les relevés mensuels (CSV) comme base de votre déclaration."
            : "The platform does not generate tax reports yet. Use the monthly statements (CSV) as the basis for your own filing."}
        </p>
      </DetailSection>
    </div>
  );
}
