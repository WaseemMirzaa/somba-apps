"use client";

import Link from "next/link";
import { DollarSign, Wallet, RotateCcw, TrendingUp, ArrowRight } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { DetailSection } from "@/components/ui/info-grid";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { RevenueAreaChart, HorizontalBarChart } from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import type { SellerPayoutItemStatus } from "@/lib/seller";
import { payoutMethodLabel, payoutStatusLabel, payoutStatusVariant, txnStatusLabel, txnStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

const STATUS_LABELS: Record<SellerPayoutItemStatus, { en: string; fr: string }> = {
  awaiting_delivery: { en: "Awaiting confirmation", fr: "En attente de confirmation" },
  pending_clearance: { en: "In delivery", fr: "En cours de livraison" },
  ready_for_payout: { en: "Delivered (earned)", fr: "Livrée (gagnée)" },
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
  const {
    sellerFinanceStats,
    sellerPayoutSummary,
    transactionList,
    payoutList,
    getPendingPayoutItems,
    statements,
    categoryRevenue,
  } = useSellerData();
  const f = sellerFinanceStats;
  const summary = sellerPayoutSummary;
  const recentTransactions = transactionList.slice(0, 8);
  const pendingItems = getPendingPayoutItems().slice(0, 6);
  const recentPayouts = payoutList.slice(0, 5);

  const revenueTrendData = [...statements]
    .reverse()
    .map((d) => ({ label: d.month, revenue: d.gross, net: d.net }));

  const categoryChartData = categoryRevenue.map((c) => ({
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
          ? `Les gains sont acquis à la livraison de la commande, après commission de ${summary.commissionPct} % ; le solde disponible vient du serveur et déduit les versements déjà demandés.`
          : `Earnings accrue once an order is delivered, minus the ${summary.commissionPct}% commission; the available balance comes from the server and already subtracts payouts you requested.`}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title={fr ? "Revenus" : "Revenue"} value={formatCurrency(f.revenue, locale)} icon={TrendingUp} />
        <StatCard title={fr ? "En cours de livraison (net)" : "In delivery (net)"} value={formatCurrency(f.pendingRevenue, locale)} icon={DollarSign} />
        <StatCard title={t("availableBalance")} value={formatCurrency(f.availableBalance, locale)} icon={Wallet} />
        <StatCard title={fr ? "Commissions payées" : "Commission Paid"} value={formatCurrency(f.commissionPaid, locale)} icon={DollarSign} />
        <StatCard title={fr ? "Montant remboursé" : "Refund Amount"} value={formatCurrency(f.refundAmount, locale)} icon={RotateCcw} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold text-slate-900">{fr ? "Tendance des revenus" : "Revenue Trend"}</h3>
            <NavLinkButton href="/seller/analytics/revenue">
              {fr ? "Voir tout" : "View all"} →
            </NavLinkButton>
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
          <NavLinkButton href="/seller/finance/transactions">
            {fr ? "Toutes les transactions" : "All transactions"} <ArrowRight className="h-3 w-3" />
          </NavLinkButton>
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
              { key: "customer", label: t("customer") },
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
                render: (row) => <Badge variant={txnStatusVariant(String(row.status))}>{txnStatusLabel(String(row.status), fr)}</Badge>,
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
              <h3 className="font-semibold text-slate-900">{fr ? "Gains par commande" : "Earnings per order"}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {fr
                  ? `${formatCurrency(summary.totalPending, locale)} en cours · ${formatCurrency(summary.availableForPayout, locale)} disponible`
                  : `${formatCurrency(summary.totalPending, locale)} in progress · ${formatCurrency(summary.availableForPayout, locale)} available`}
              </p>
            </div>
            <NavLinkButton href="/seller/finance/payouts/pending">
              {fr ? "Voir détail" : "View breakdown"} →
            </NavLinkButton>
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
            <NavLinkButton href="/seller/finance/payouts">
              {fr ? "Tous les versements" : "All payouts"} →
            </NavLinkButton>
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
                { key: "methodKey", label: fr ? "Méthode" : "Method", render: (row) => payoutMethodLabel(String(row.methodKey), fr) },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => (
                    <Badge variant={payoutStatusVariant(String(row.status))}>{payoutStatusLabel(String(row.status), fr)}</Badge>
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
          <h3 className="font-semibold text-slate-900">{fr ? "Commission" : "Commission"}</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            {fr
              ? `La plateforme prélève ${summary.commissionPct} % sur chaque vente livrée (taux unique, fixé par la plateforme). Commission sur vos ventes à ce jour : ${formatCurrency(f.commissionPaid, locale)}.`
              : `The platform keeps ${summary.commissionPct}% of every delivered sale (one flat rate set by the platform). Commission on your sales so far: ${formatCurrency(f.commissionPaid, locale)}.`}
          </p>
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
            data={categoryRevenue as unknown as Record<string, unknown>[]}
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
