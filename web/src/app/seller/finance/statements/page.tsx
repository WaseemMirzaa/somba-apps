"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { sellerStatementList } from "@/lib/seller-entities";
import { useLocale } from "@/context/locale-context";

export default function SellerStatementsPage() {
  const { locale, t } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader title={t("statementsList")} subtitle={fr ? "Relevés financiers mensuels" : "Monthly financial statements"} backHref="/seller/finance" />
      <div className="space-y-3">
        {sellerStatementList.map((stmt) => (
          <Link key={stmt.id} href={`/seller/finance/statements/${stmt.id}`} className="card-premium flex items-center justify-between p-5 hover:border-sky-200">
            <span className="font-medium">{stmt.month}</span>
            <span className="text-sm text-sky-600">{t("view")} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
