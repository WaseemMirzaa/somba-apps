"use client";

import Link from "next/link";
import { DollarSign, Wallet, RotateCcw, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useLocale } from "@/context/locale-context";
import { sellerFinanceStats } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";

export default function SellerFinancePage() {
  const { t, locale } = useLocale();
  const f = sellerFinanceStats;

  const navLinks = [
    { href: "/seller/finance/transactions", label: "Transactions" },
    { href: "/seller/finance/payouts", label: t("payouts") },
    { href: "/seller/finance/statements", label: "Statements" },
    { href: "/seller/finance/tax", label: "Tax Reports" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("finance")}
        subtitle="Revenue · Pending · Available Balance · Commission · Refunds"
        breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("finance") }]}
        actions={
          <Link href="/seller/finance/payouts/request" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">
            {t("requestPayout")}
          </Link>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Payout accrues after delivery confirmation, then 48h clearance before withdrawal.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Revenue" value={formatCurrency(f.revenue, locale)} icon={TrendingUp} />
        <StatCard title="Pending Revenue" value={formatCurrency(f.pendingRevenue, locale)} icon={DollarSign} />
        <StatCard title={t("availableBalance")} value={formatCurrency(f.availableBalance, locale)} icon={Wallet} />
        <StatCard title="Commission Paid" value={formatCurrency(f.commissionPaid, locale)} icon={DollarSign} />
        <StatCard title="Refund Amount" value={formatCurrency(f.refundAmount, locale)} icon={RotateCcw} />
      </div>

      <DetailSection title="Finance Navigation">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-lg border border-sky-100 p-4 text-center font-medium text-sky-700 hover:bg-sky-50">
              {link.label} →
            </Link>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}
