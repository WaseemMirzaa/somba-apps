"use client";

import { DollarSign, TrendingUp, Wallet, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";

const transactions = [
  { id: "TXN-901", type: "Order Payment", amount: 119900, status: "completed", date: "2024-06-08" },
  { id: "TXN-902", type: "Seller Payout", amount: -45000, status: "completed", date: "2024-06-08" },
  { id: "TXN-903", type: "Refund", amount: -12900, status: "pending", date: "2024-06-07" },
  { id: "TXN-904", type: "Payment Settlement", amount: 89000, status: "completed", date: "2024-06-07" },
];

export default function AdminFinancePage() {
  const { t, locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("finance")}
        subtitle="Platform revenue, payouts & settlements"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: t("finance") }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("revenue")} value={formatCurrency(2840000, locale)} icon={DollarSign} trend="+8.2% this week" />
        <StatCard title="Pending Payouts" value={formatCurrency(340000, locale)} icon={Wallet} />
        <StatCard title="Payment Outstanding" value={formatCurrency(125000, locale)} icon={CreditCard} />
        <StatCard title="Refunds (MTD)" value={formatCurrency(89000, locale)} icon={TrendingUp} />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "Transaction" },
              { key: "type", label: "Type" },
              { key: "amount", label: t("amount"), render: (row) => {
                const amt = Number(row.amount);
                return <span className={amt < 0 ? "text-red-600" : "text-emerald-600"}>{formatCurrency(Math.abs(amt), locale)}</span>;
              }},
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={row.status === "completed" ? "success" : "warning"}>{String(row.status)}</Badge>
              )},
              { key: "date", label: t("date") },
            ]}
            data={transactions as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
