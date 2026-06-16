"use client";

import Link from "next/link";
import { DollarSign, Wallet, RotateCcw, TrendingUp, ArrowRight } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { RevenueAreaChart, HorizontalBarChart } from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import {
  sellerFinanceStats,
  sellerPayoutSummary,
  transactionList,
  payoutList,
  sellerFinanceRevenueByCategory,
  sellerCommissionByTier,
  sellerFinanceNetCommissionTrend,
  getPendingPayoutItems,
  type SellerPayoutItemStatus,
} from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_LABELS: Record<SellerPayoutItemStatus, { en: string; fr: string }> = {
  awaiting_delivery: { en: "Awaiting delivery", fr: "En attente de livraison" },
  pending_clearance: { en: "Pending clearance", fr: "Délai de sécurisation" },
  ready_for_payout: { en: "Ready for payout", fr: "Prêt pour versement" },
  paid_out: { en: "Paid out", fr: "Versé" },
};

function statusBadgeVariant(status: SellerPayoutItemStatus) {
  switch (status) {
    case "paid_out":
      return "success" as const;
    case "ready_for_payout":
      return "primary" as const;
    case "pending_clearance":
      return "info" as const;
    default:
      return "warning" as const;
  }
}

export default function SellerFinancePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const f = sellerFinanceStats;
  const summary = sellerPayoutSummary;
  const recentTransactions = transactionList.slice(0, 8);
  const pendingItems = getPendingPayoutItems().slice(0, 6);
  const recentPayouts = payoutList.slice(0, 5);

  const revenueTrendData = sellerFinanceNetCommissionTrend.map((d) => ({
    label: d.label,
    revenue: d.net + d.commission,
    net: d.net,
  }));

  const categoryChartData = sellerFinanceRevenueByCategory.map((c) => ({
    label: fr ? c.categoryFr : c.category,
    value: c.net,
  }));

  const navLinks = [
    { href: "/seller/finance/transactions", label: fr ? "Transactions" : "Transactions" },
    { href: "/seller/finance/payouts", label: t("payouts") },
    { href: "/seller/finance/statements", label: fr ? "Relevés" : "Statements" },
    { href: "/seller/finance/tax", label: fr ? "Rapports fiscaux" : "Tax Reports" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("finance")}
        subtitle={
          fr
            ? "Revenus · En attente · Solde disponible · Commission · Remboursements"
            : "Revenue · Pending · Available Balance · Commission · Refunds"
        }
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("finance") }]}
        actions={
          <Link href="/seller/finance/payouts/request" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
            {t("requestPayout")}
          </Link>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {fr
          ? `Les gains sont versés après confirmation de livraison et réconciliation entrepôt, puis un délai de sécurisation de ${summary.clearanceHours}h.`
          : `Earnings accrue after delivery confirmation and warehouse reconciliation, then a ${summary.clearanceHours}h clearance period.`}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title={fr ? "Revenus" : "Revenue"} value={formatCurrency(f.revenue, locale)} icon={TrendingUp} />
        <StatCard title={fr ? "Revenus en attente" : "Pending Revenue"} value={formatCurrency(f.pendingRevenue, locale)} icon={DollarSign} />
        <StatCard title={t("availableBalance")} value={formatCurrency(f.availableBalance, locale)} icon={Wallet} />
        <StatCard title={fr ? "Commissions payées" : "Commission Paid"} value={formatCurrency(f.commissionPaid, locale)} icon={DollarSign} />
        <StatCard title={fr ? "Montant remboursé" : "Refund Amount"} value={formatCurrency(f.refundAmount, locale)} icon={RotateCcw} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold text-slate-900">{fr ? "Tendance des revenus" : "Revenue Trend"}</h3>
            <Link href="/seller/analytics/revenue" className="text-xs font-medium text-[var(--primary)] hover:underline">
              {fr ? "Voir tout" : "View all"} →
            </Link>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart data={revenueTrendData} valueKey="revenue" height={200} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold text-slate-900">{fr ? "Revenus par catégorie" : "Revenue by Category"}</h3>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={categoryChartData.map((c) => ({ name: c.label, revenue: c.value }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <h3 className="font-semibold text-slate-900">{fr ? "Transactions récentes" : "Recent Transactions"}</h3>
          <Link href="/seller/finance/transactions" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline">
            {fr ? "Toutes les transactions" : "All transactions"} <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "order",
                label: fr ? "Commande" : "Order",
                render: (row) => (
                  <Link href={`/seller/orders/${row.order}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.order)}
                  </Link>
                ),
              },
              { key: "customer", label: fr ? "Client" : "Customer" },
              {
                key: "grossAmount",
                label: fr ? "Brut" : "Gross",
                render: (row) => formatCurrency(row.grossAmount as number, locale),
              },
              {
                key: "commission",
                label: fr ? "Commission" : "Commission",
                render: (row) => formatCurrency(row.commission as number, locale),
              },
              {
                key: "netAmount",
                label: fr ? "Net" : "Net",
                render: (row) => formatCurrency(row.netAmount as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => <Badge variant="success">{String(row.status)}</Badge>,
              },
              { key: "date", label: t("date") },
            ]}
            data={recentTransactions as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <h3 className="font-semibold text-slate-900">{fr ? "Versements en attente" : "Pending Clearance & Payout"}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {fr
                  ? `${formatCurrency(summary.totalPending, locale)} en attente · ${formatCurrency(summary.availableForPayout, locale)} disponible`
                  : `${formatCurrency(summary.totalPending, locale)} pending · ${formatCurrency(summary.availableForPayout, locale)} available`}
              </p>
            </div>
            <Link href="/seller/finance/payouts/pending" className="text-xs font-medium text-[var(--primary)] hover:underline">
              {fr ? "Voir détail" : "View breakdown"} →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "orderId",
                  label: fr ? "Commande" : "Order",
                  render: (row) => (
                    <Link href={`/seller/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">
                      {String(row.orderId)}
                    </Link>
                  ),
                },
                { key: "listingName", label: fr ? "Produit" : "Listing" },
                {
                  key: "netEarnings",
                  label: fr ? "Gains nets" : "Net",
                  render: (row) => formatCurrency(row.netEarnings as number, locale),
                },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => {
                    const status = row.status as SellerPayoutItemStatus;
                    const label = fr ? STATUS_LABELS[status].fr : STATUS_LABELS[status].en;
                    return <Badge variant={statusBadgeVariant(status)}>{label}</Badge>;
                  },
                },
              ]}
              data={pendingItems as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold text-slate-900">{fr ? "Derniers versements" : "Recent Payouts"}</h3>
            <Link href="/seller/finance/payouts" className="text-xs font-medium text-[var(--primary)] hover:underline">
              {fr ? "Tous les versements" : "All payouts"} →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "id",
                  label: fr ? "Référence" : "Request ID",
                  render: (row) => (
                    <Link href={`/seller/finance/payouts/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.id)}
                    </Link>
                  ),
                },
                {
                  key: "amount",
                  label: t("amount"),
                  render: (row) => formatCurrency(row.amount as number, locale),
                },
                { key: "method", label: fr ? "Méthode" : "Method" },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => (
                    <Badge variant={row.status === "paid" ? "success" : "warning"}>{String(row.status)}</Badge>
                  ),
                },
                { key: "date", label: t("date") },
              ]}
              data={recentPayouts as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <h3 className="font-semibold text-slate-900">{fr ? "Répartition des commissions" : "Commission Breakdown"}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {fr ? "Taux par catégorie et palier vendeur" : "Rates by category and seller tier"}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "tier",
                label: fr ? "Palier" : "Tier",
                render: (row) => (fr ? String(row.tierFr) : String(row.tier)),
              },
              {
                key: "rate",
                label: fr ? "Taux" : "Rate",
                render: (row) => `${row.rate}%`,
              },
              {
                key: "gross",
                label: fr ? "Revenu brut" : "Gross",
                render: (row) => formatCurrency(row.gross as number, locale),
              },
              {
                key: "commission",
                label: fr ? "Commission" : "Commission",
                render: (row) => formatCurrency(row.commission as number, locale),
              },
              { key: "orders", label: fr ? "Commandes" : "Orders" },
            ]}
            data={sellerCommissionByTier as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h3 className="font-semibold text-slate-900">{fr ? "Revenus par catégorie" : "Revenue by Category"}</h3>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "category",
                label: fr ? "Catégorie" : "Category",
                render: (row) => (fr ? String(row.categoryFr) : String(row.category)),
              },
              {
                key: "gross",
                label: fr ? "Brut" : "Gross",
                render: (row) => formatCurrency(row.gross as number, locale),
              },
              {
                key: "net",
                label: fr ? "Net" : "Net",
                render: (row) => formatCurrency(row.net as number, locale),
              },
              {
                key: "commission",
                label: fr ? "Commission" : "Commission",
                render: (row) => formatCurrency(row.commission as number, locale),
              },
              { key: "orders", label: fr ? "Commandes" : "Orders" },
              {
                key: "rate",
                label: fr ? "Taux" : "Rate",
                render: (row) => `${row.rate}%`,
              },
            ]}
            data={sellerFinanceRevenueByCategory as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <DetailSection title={fr ? "Navigation finance" : "Finance Navigation"}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-[var(--primary-tint)] p-4 text-center font-medium text-[var(--primary)] hover:bg-[var(--primary-light)]"
            >
              {link.label} →
            </Link>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}
