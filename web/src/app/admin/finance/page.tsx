"use client";

import { DollarSign, TrendingUp, Wallet, CreditCard, Percent, Scale, Receipt, Banknote } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  DualMetricChart,
  SegmentDonut,
  FunnelChart,
  HorizontalBarChart,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import {
  financeKpis,
  revenueVsPayouts,
  commissionByCategory,
  paymentMethodSplit,
  settlementAging,
  cashFlowStages,
  refundReasons,
} from "@/lib/finance-analytics";

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

const TXN_STATUS_FR: Record<string, string> = { completed: "Terminé", pending: "En attente" };

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function AdminFinancePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const k = financeKpis;

  const commissionSegments = commissionByCategory.map((c) => ({ label: fr ? c.labelFr : c.label, pct: c.pct, color: c.color }));
  const paymentSegments = paymentMethodSplit.map((c) => ({ label: fr ? c.labelFr : c.label, pct: c.pct, color: c.color }));
  const agingItems = settlementAging.map((b) => ({ name: fr ? b.bucketFr : b.bucket, amount: b.amount }));
  const reasonItems = refundReasons.map((r) => ({ name: fr ? r.reasonFr : r.reason, count: r.count }));
  const funnelStages = cashFlowStages.map((s) => ({ stage: fr ? s.stageFr : s.stage, count: s.count, pct: s.pct }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("finance")}
        subtitle={fr ? "Chiffre d'affaires, commissions, versements, remboursements et règlements" : "Revenue, commission, payouts, refunds & settlements"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("finance") }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={fr ? "Chiffre brut" : "Gross revenue"} value={formatCurrency(k.grossRevenue, locale)} icon={DollarSign} trend={`+${k.grossChange}% ${fr ? "cette semaine" : "this week"}`} />
        <StatCard title={fr ? "Revenu net" : "Net revenue"} value={formatCurrency(k.netRevenue, locale)} icon={TrendingUp} trend={`+${k.netChange}%`} />
        <StatCard title={fr ? "Commissions" : "Commission earned"} value={formatCurrency(k.commissionEarned, locale)} icon={Percent} trend={`+${k.commissionChange}%`} />
        <StatCard title={fr ? "Versements en attente" : "Pending payouts"} value={formatCurrency(k.pendingPayouts, locale)} icon={Wallet} />
        <StatCard title={fr ? "Remboursements (MTD)" : "Refunds (MTD)"} value={formatCurrency(k.refundsMtd, locale)} icon={Receipt} />
        <StatCard title={fr ? "Paiements en souffrance" : "Outstanding"} value={formatCurrency(k.outstanding, locale)} icon={CreditCard} />
        <StatCard title={fr ? "Retenue fiscale" : "Tax withheld"} value={formatCurrency(k.taxWithheld, locale)} icon={Banknote} />
        <StatCard title={fr ? "Gel litiges" : "Dispute hold"} value={formatCurrency(k.disputeHold, locale)} icon={Scale} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title={fr ? "Chiffre d'affaires vs versements" : "Revenue vs payouts"}
          subtitle={fr ? "Barres : chiffre brut · Ligne : versements vendeurs (8 semaines)" : "Bars: gross revenue · Line: seller payouts (8 weeks)"}
        >
          <DualMetricChart data={revenueVsPayouts} height={240} />
        </ChartCard>

        <ChartCard title={fr ? "Commissions par catégorie" : "Commission by category"} subtitle={fr ? "Part des commissions" : "Share of commission earned"}>
          <SegmentDonut segments={commissionSegments} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title={fr ? "Flux de trésorerie" : "Cash flow"} subtitle={fr ? "Du brut au net plateforme" : "Gross → net to platform"}>
          <FunnelChart stages={funnelStages} />
        </ChartCard>

        <ChartCard title={fr ? "Modes de paiement" : "Payment methods"} subtitle={fr ? "Part du volume encaissé" : "Share of collected volume"}>
          <SegmentDonut segments={paymentSegments} />
        </ChartCard>

        <ChartCard title={fr ? "Ancienneté des règlements" : "Settlement aging"} subtitle={fr ? "Versements en attente par cohorte" : "Pending payouts by age"}>
          <HorizontalBarChart
            items={agingItems}
            valueKey="amount"
            labelKey="name"
            formatValue={(v) => formatCurrency(v, locale)}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-1" title={fr ? "Motifs de remboursement" : "Top refund reasons"} subtitle={fr ? "Nombre ce mois-ci" : "Count this month"}>
          <HorizontalBarChart items={reasonItems} valueKey="count" labelKey="name" formatValue={(v) => String(v)} />
        </ChartCard>

        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{fr ? "Transactions récentes" : "Recent transactions"}</h2>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "id", label: t("transaction") },
                { key: "type", label: t("type"), render: (row) => <span>{fr ? (TXN_TYPE_FR[String(row.type)] ?? String(row.type)) : String(row.type)}</span> },
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
    </div>
  );
}
