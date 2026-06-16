"use client";

import { DollarSign, TrendingUp, Wallet, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { adminBreadcrumb } from "@/lib/admin-i18n";

const transactions = [
  { id: "TXN-901", type: "Order Payment", amount: 119900, status: "completed", date: "2024-06-08" },
  { id: "TXN-902", type: "Seller Payout", amount: -45000, status: "completed", date: "2024-06-08" },
  { id: "TXN-903", type: "Refund", amount: -12900, status: "pending", date: "2024-06-07" },
  { id: "TXN-904", type: "Payment Settlement", amount: 89000, status: "completed", date: "2024-06-07" },
];

const TXN_TYPE_FR: Record<string, string> = {
  "Order Payment": "Paiement de commande",
  "Seller Payout": "Versement vendeur",
  "Refund": "Remboursement",
  "Payment Settlement": "Règlement de paiement",
};

const TXN_STATUS_FR: Record<string, string> = {
  completed: "Terminé",
  pending: "En attente",
};

export default function AdminFinancePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("finance")}
        subtitle={fr ? "Chiffre d'affaires, versements et règlements de la plateforme" : "Platform revenue, payouts & settlements"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("finance") }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("revenue")} value={formatCurrency(2840000, locale)} icon={DollarSign} trend={fr ? "+8,2 % cette semaine" : "+8.2% this week"} />
        <StatCard title={fr ? "Versements en attente" : "Pending Payouts"} value={formatCurrency(340000, locale)} icon={Wallet} />
        <StatCard title={fr ? "Paiements en souffrance" : "Payment Outstanding"} value={formatCurrency(125000, locale)} icon={CreditCard} />
        <StatCard title={fr ? "Remboursements (mois en cours)" : "Refunds (MTD)"} value={formatCurrency(89000, locale)} icon={TrendingUp} />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: t("transaction") },
              { key: "type", label: t("type"), render: (row) => (
                <span>{fr ? (TXN_TYPE_FR[String(row.type)] ?? String(row.type)) : String(row.type)}</span>
              )},
              { key: "amount", label: t("amount"), render: (row) => {
                const amt = Number(row.amount);
                return <span className={amt < 0 ? "text-red-600" : "text-emerald-600"}>{formatCurrency(Math.abs(amt), locale)}</span>;
              }},
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={row.status === "completed" ? "success" : "warning"}>{fr ? (TXN_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>
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
