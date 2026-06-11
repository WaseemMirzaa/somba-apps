"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useLocale } from "@/context/locale-context";

export default function SellerTaxPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader title={t("taxReports")} subtitle={`${t("taxId")}: CD-123456789`} backHref="/seller/finance" />
      <DetailSection title={t("taxReports")}>
        <p className="text-sm text-slate-500">{t("taxReportsPlaceholder")}</p>
      </DetailSection>
    </div>
  );
}
