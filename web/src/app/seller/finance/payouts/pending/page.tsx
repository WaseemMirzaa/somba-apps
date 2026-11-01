"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceEarnings } from "@/components/seller/finance-earnings";
import { FinanceRules } from "@/components/seller/finance-rules";
import { useLocale } from "@/context/locale-context";
import { useFinanceBalance } from "@/lib/seller-finance";

/** Earnings per order line: what each sale earns, and where it is on the way to your bank (server clearance hold). */
export default function SellerPayoutPendingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const balance = useFinanceBalance();

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Gains par commande" : "Earnings per order"}
        subtitle={fr ? "Chaque ligne de commande, ce qu'elle rapporte et quand elle devient retirable" : "Every order line, what it earns and when it can be withdrawn"}
        backHref="/seller/finance"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("finance"), href: "/seller/finance" },
          { label: fr ? "Gains" : "Earnings" },
        ]}
        actions={
          <Link href="/seller/finance/payouts/request" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
            {t("requestPayout")}
          </Link>
        }
      />
      <FinanceRules balance={balance.data} />
      <FinanceEarnings />
    </div>
  );
}
