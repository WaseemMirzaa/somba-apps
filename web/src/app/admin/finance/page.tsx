"use client";

import Link from "next/link";
import { DollarSign, TrendingUp, Wallet, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { formatCurrency } from "@/lib/utils";
import { adminFinanceTransactions } from "@/lib/admin-entities";

export default function AdminFinancePage() {
  const { t, locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("finance")}
        subtitle={t("platformFinanceSubtitle")}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("finance") }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("revenue")} value={formatCurrency(2840000, locale)} icon={DollarSign} trend={t("thisWeekTrend")} />
        <StatCard title={t("pendingPayouts")} value={formatCurrency(340000, locale)} icon={Wallet} />
        <StatCard title={t("codOutstanding")} value={formatCurrency(125000, locale)} icon={CreditCard} />
        <StatCard title={t("refundsMtd")} value={formatCurrency(89000, locale)} icon={TrendingUp} />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: t("transaction"), render: (row) => (
                <Link href={`/admin/finance/transactions/${row.id}`} className="font-medium text-blue-600 hover:underline">{String(row.id)}</Link>
              )},
              { key: "type", label: t("type") },
              { key: "amount", label: t("amount"), render: (row) => {
                const amt = Number(row.amount);
                return <span className={amt < 0 ? "text-red-600" : "text-emerald-600"}>{formatCurrency(Math.abs(amt), locale)}</span>;
              }},
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={row.status === "completed" ? "success" : "warning"}>{statusLabel(locale, String(row.status))}</Badge>
              )},
              { key: "date", label: t("date") },
              { key: "actions", label: t("action"), render: (row) => (
                <Link href={`/admin/finance/transactions/${row.id}`} className="text-sm text-blue-600 hover:underline">{t("view")}</Link>
              )},
            ]}
            data={adminFinanceTransactions as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
