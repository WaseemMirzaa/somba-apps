"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DollarSign,
  ShoppingCart,
  Package,
  RotateCcw,
  TrendingUp,
  Users,
  Target,
  RefreshCw,
  Wallet,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  DualMetricChart,
  RetentionBarChart,
  SegmentDonut,
  FunnelChart,
  HorizontalBarChart,
  GoalProgress,
  Sparkline,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { useSellerGoals } from "@/context/seller-goals-context";
import {
  sellerStore,
  sellerDashboardStats,
  sellerOrderList,
  lowStockProducts,
  promotionList,
  sellerFinanceStats,
} from "@/lib/seller-entities";
import {
  sellerRevenueTrend,
  sellerRetentionTrend,
  sellerCustomerSegments,
  sellerOrderFunnel,
  sellerCategoryRevenue,
  sellerExtendedKpis,
  sellerHealthBreakdown,
  sellerFulfillmentMetrics,
  sellerRecentActivity,
  sellerTopProductsChart,
} from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

const PERIODS = ["7D", "30D", "90D"] as const;

function KpiCard({
  title,
  value,
  change,
  positive,
  spark,
  icon: Icon,
}: {
  title: string;
  value: string;
  change: number;
  positive?: boolean;
  spark: number[];
  icon: React.ComponentType<{ className?: string }>;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const up = change >= 0;
  const good = positive !== undefined ? (positive ? up : !up) : up;

  return (
    <div className="card-premium p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">{value}</p>
          <p className={cn("mt-1 flex items-center gap-0.5 text-xs font-semibold", good ? "text-emerald-600" : "text-red-500")}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change)}% {fr ? "vs période précédente" : "vs last period"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-xl bg-blue-50 p-2">
            <Icon className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <Sparkline values={spark} />
        </div>
      </div>
    </div>
  );
}

export default function SellerDashboard() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const k = sellerExtendedKpis;
  const s = sellerDashboardStats;
  const { goals } = useSellerGoals();

  const revenueSpark = sellerRevenueTrend.map((d) => d.revenue);
  const ordersSpark = sellerRevenueTrend.map((d) => d.orders);

  const healthLabelsFr: Record<string, string> = {
    "Fulfillment speed": "Vitesse de traitement",
    "Return rate": "Taux de retour",
    "Customer rating": "Note des clients",
    "Stock availability": "Disponibilité du stock",
    "Response time": "Temps de réponse",
  };

  const orderStatusFr: Record<string, string> = {
    pending: "En attente",
    processing: "En cours",
    ready: "Prêt",
    delivered: "Livré",
    cancelled: "Annulé",
  };

  const quickActions = [
    { href: "/seller/orders", label: t("orders"), sub: fr ? `${s.pendingOrders} en attente` : `${s.pendingOrders} pending`, icon: ShoppingCart, color: "bg-blue-50 text-blue-700" },
    { href: "/seller/products/create", label: t("createProduct"), sub: fr ? "Ajouter une annonce" : "Add listing", icon: Package, color: "bg-emerald-50 text-emerald-700" },
    { href: "/seller/finance/payouts/request", label: fr ? "Demander un paiement" : "Request payout", sub: formatCurrency(sellerFinanceStats.availableBalance, locale), icon: Wallet, color: "bg-violet-50 text-violet-700" },
    { href: "/seller/promotions/create", label: fr ? "Demander une promotion" : "Request promotion", sub: fr ? "Booster les ventes" : "Boost sales", icon: TrendingUp, color: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={sellerStore.name}
        subtitle={fr ? `${t("welcome")}, ${sellerStore.owner} · ${sellerStore.badge} Vendeur · ⭐ ${sellerStore.rating} · Santé ${sellerStore.healthScore}%` : `${t("welcome")}, ${sellerStore.owner} · ${sellerStore.badge} Seller · ⭐ ${sellerStore.rating} · Health ${sellerStore.healthScore}%`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/seller/analytics" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("analytics")}
            </Link>
            <Link href="/seller/products/create" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
              {t("createProduct")}
            </Link>
          </div>
        }
      />

      {/* KPI grid with sparklines */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={fr ? "Revenu (mois)" : "Revenue (MTD)"} value={formatCurrency(k.mtdRevenue, locale)} change={k.mtdRevenueChange} spark={revenueSpark} icon={DollarSign} />
        <KpiCard title={fr ? "Commandes (mois)" : "Orders (MTD)"} value={String(k.mtdOrders)} change={k.mtdOrdersChange} spark={ordersSpark} icon={ShoppingCart} />
        <KpiCard title={fr ? "Panier moyen" : "Avg. order value"} value={formatCurrency(k.avgOrderValue, locale)} change={k.aovChange} spark={revenueSpark.map((v, i) => v / Math.max(ordersSpark[i], 1))} icon={Target} />
        <KpiCard title={fr ? "Taux de conversion" : "Conversion rate"} value={`${k.conversionRate}%`} change={k.conversionChange} spark={[2.8, 3.0, 3.1, 3.2, 3.4, 3.5, 3.8]} icon={BarChart3} />
        <KpiCard title={fr ? "Rétention client" : "Customer retention"} value={`${k.retentionRate}%`} change={k.retentionChange} spark={sellerRetentionTrend.map((d) => d.retention)} icon={RefreshCw} />
        <KpiCard title={fr ? "Clients fidèles" : "Repeat customers"} value={`${k.repeatCustomerRate}%`} change={k.repeatChange} spark={[44, 46, 48, 49, 50, 51, 52]} icon={Users} />
        <KpiCard title={fr ? "Valeur vie client" : "Customer LTV"} value={formatCurrency(k.customerLifetimeValue, locale)} change={k.clvChange} spark={[240, 252, 260, 268, 275, 280, 284]} icon={TrendingUp} />
        <KpiCard title={fr ? "Taux de remboursement" : "Refund rate"} value={`${k.refundRate}%`} change={k.refundChange} positive={false} spark={[1.8, 1.6, 1.5, 1.4, 1.3, 1.2, 1.2]} icon={RotateCcw} />
      </div>

      {/* Main charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{fr ? "Revenu et commandes" : "Revenue & orders"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Gains nets" : "Net earnings"} {formatCurrency(k.netEarnings, locale)} · +{k.netChange}%</p>
            </div>
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                    period === p ? "bg-[var(--primary)] text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={sellerRevenueTrend} height={240} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Objectifs du mois" : "Monthly goals"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Progression vers les objectifs de juin" : "Progress toward June targets"}</p>
            </div>
            <Link href="/seller/settings" className="shrink-0 text-xs font-medium text-[var(--primary)] hover:underline">{fr ? "Modifier" : "Edit"}</Link>
          </CardHeader>
          <CardContent className="space-y-6">
            {goals.length === 0 ? (
              <p className="text-sm text-slate-400">{fr ? "Aucun objectif défini. Ajoutez-en dans les paramètres." : "No goals yet — add some in Settings."}</p>
            ) : (
              goals.map((g) => (
                <GoalProgress
                  key={g.id}
                  label={fr ? g.labelFr : g.label}
                  current={g.current}
                  target={g.target}
                  unit={g.metric === "percent" ? "%" : ""}
                  format={g.metric === "currency" ? (n) => formatCurrency(n, locale) : undefined}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Retention + customer segments */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Rétention client" : "Customer retention"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Taux de rachat d'un mois à l'autre" : "Month-over-month repeat purchase rate"}</p>
            </div>
            <Badge variant="success">+{k.retentionChange}%</Badge>
          </CardHeader>
          <CardContent>
            <RetentionBarChart data={sellerRetentionTrend} />
            <div className="mt-4 flex gap-4 rounded-xl bg-slate-50 p-4 text-center text-sm">
              <div className="flex-1">
                <p className="font-bold text-slate-900">1,478</p>
                <p className="text-xs text-slate-500">{fr ? "Total clients" : "Total customers"}</p>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <p className="font-bold text-emerald-600">891</p>
                <p className="text-xs text-slate-500">{fr ? "Récurrents (60j)" : "Returning (60d)"}</p>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <p className="font-bold text-amber-600">156</p>
                <p className="text-xs text-slate-500">{fr ? "À risque" : "At-risk"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Segments de clients" : "Customer segments"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Répartition par comportement d'achat" : "Breakdown by purchase behavior"}</p>
          </CardHeader>
          <CardContent>
            <SegmentDonut
              segments={sellerCustomerSegments.map((seg) => ({
                label: fr ? seg.labelFr : seg.label,
                pct: seg.pct,
                color: seg.color,
              }))}
            />
            <div className="mt-6 grid grid-cols-2 gap-3">
              {sellerCustomerSegments.map((seg) => (
                <div key={seg.id} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">{fr ? seg.labelFr : seg.label}</p>
                  <p className="text-lg font-bold text-slate-900">{seg.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel + category revenue */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Entonnoir de conversion" : "Conversion funnel"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Vues → livré (30 derniers jours)" : "Views → delivered (last 30 days)"}</p>
          </CardHeader>
          <CardContent>
            <FunnelChart
              stages={sellerOrderFunnel.map((f) => ({
                stage: fr ? f.stageFr : f.stage,
                count: f.count,
                pct: f.pct,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Chiffre d'affaires par catégorie" : "Revenue by category"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Répartition du mois en cours" : "MTD breakdown"}</p>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerCategoryRevenue.map((c) => ({ name: fr ? c.categoryFr : c.category, revenue: c.revenue }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Health + fulfillment + quick actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Score de santé de la boutique" : "Store health score"}</h2>
            <p className="text-3xl font-bold text-[var(--primary)]">{s.healthScore}%</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {sellerHealthBreakdown.map((h) => (
              <div key={h.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-600">{fr ? healthLabelsFr[h.label] ?? h.label : h.label}</span>
                  <span className="font-bold text-slate-900">{h.score}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${h.score}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Indicateurs de traitement" : "Fulfillment metrics"}</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: fr ? "Livraison à temps" : "On-time delivery", value: `${sellerFulfillmentMetrics.onTimeDelivery}%` },
                { label: fr ? "Expédition moy." : "Avg dispatch", value: `${sellerFulfillmentMetrics.avgDispatchHours}h` },
                { label: fr ? "Taux de retour" : "Return rate", value: `${sellerFulfillmentMetrics.returnRate}%` },
                { label: fr ? "Annulation" : "Cancellation", value: `${sellerFulfillmentMetrics.cancellationRate}%` },
                { label: fr ? "Expéditions ouvertes" : "Open shipments", value: String(sellerFulfillmentMetrics.openShipments) },
                { label: fr ? "Note moy." : "Avg rating", value: `⭐ ${sellerFulfillmentMetrics.avgRating}` },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{m.label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{m.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Actions rapides" : "Quick actions"}</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
              >
                <div className={cn("rounded-lg p-2", a.color)}>
                  <a.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{a.label}</p>
                  <p className="text-xs text-slate-500">{a.sub}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Products chart + activity + orders */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold text-slate-900">{fr ? "Meilleurs produits" : "Top products"}</h2>
            <Link href="/seller/analytics/products" className="text-xs text-[var(--primary)] hover:underline">{fr ? "Détails" : "Details"}</Link>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerTopProductsChart.map((p) => ({ name: p.name, sold: p.sold }))}
              valueKey="sold"
              labelKey="name"
              formatValue={(v) => fr ? `${v} vendus` : `${v} sold`}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold text-slate-900">{fr ? "Activité en direct" : "Live activity"}</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {sellerRecentActivity.map((a, i) => (
                <li key={i} className="flex gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                  <div>
                    <p className="text-sm text-slate-800">{fr ? a.textFr : a.text}</p>
                    <p className="text-xs text-slate-400">{fr ? a.timeFr : a.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("lowStock")}</h2>
            <Link href="/seller/inventory" className="text-xs text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "name",
                  label: fr ? "Produit" : "Product",
                  render: (row) => (
                    <Link href={`/seller/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.name)}
                    </Link>
                  ),
                },
                { key: "sku", label: "SKU" },
                {
                  key: "availableStock",
                  label: "Stock",
                  render: (row) => <Badge variant="warning">{String(row.availableStock)} {fr ? "restants" : "left"}</Badge>,
                },
              ]}
              data={lowStockProducts as unknown as Record<string, unknown>[]}
              rowAction={(row) => (
                <Link href={`/seller/products/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: orders, promotions, finance snapshot */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("recentOrders")}</h2>
            <Link href="/seller/orders" className="text-sm text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "id",
                  label: fr ? "Commande" : "Order",
                  render: (row) => (
                    <Link href={`/seller/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.id)}
                    </Link>
                  ),
                },
                { key: "customer", label: t("customer") },
                { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
                { key: "orderStatus", label: t("status"), render: (row) => <Badge variant="info">{fr ? (orderStatusFr[String(row.orderStatus)] ?? String(row.orderStatus)) : String(row.orderStatus)}</Badge> },
              ]}
              data={sellerOrderList.slice(0, 5) as unknown as Record<string, unknown>[]}
              rowAction={(row) => (
                <Link href={`/seller/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="font-semibold text-slate-900">{fr ? "Promotions actives" : "Active promotions"}</h2>
              <Link href="/seller/promotions" className="text-sm text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={[
                  {
                    key: "campaign",
                    label: fr ? "Campagne" : "Campaign",
                    render: (row) => (
                      <Link href={`/seller/promotions/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                        {String(row.campaign)}
                      </Link>
                    ),
                  },
                  { key: "discount", label: fr ? "Remise" : "Discount", render: (row) => `${row.discount}%` },
                  { key: "orders", label: fr ? "Commandes" : "Orders" },
                  { key: "revenue", label: fr ? "Chiffre d'affaires" : "Revenue", render: (row) => formatCurrency(row.revenue as number, locale) },
                  { key: "roi", label: "ROI", render: (row) => <Badge variant="success">{String(row.roi)}x</Badge> },
                  { key: "status", label: t("status"), render: (row) => <Badge variant="success">{fr ? String(row.statusFr) : String(row.status)}</Badge> },
                ]}
                data={promotionList.filter((p) => p.status === "active") as unknown as Record<string, unknown>[]}
                rowAction={(row) => (
                  <Link href={`/seller/promotions/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Truck className="h-4 w-4 text-[var(--primary)]" />
              <h2 className="font-semibold text-slate-900">{fr ? "Aperçu financier" : "Finance snapshot"}</h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-blue-50 p-4">
                  <p className="text-xs text-slate-500">{fr ? "Solde disponible" : "Available balance"}</p>
                  <p className="text-xl font-bold text-[var(--primary)]">{formatCurrency(sellerFinanceStats.availableBalance, locale)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">{fr ? "Chiffre d'affaires en attente" : "Pending revenue"}</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(sellerFinanceStats.pendingRevenue, locale)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">{fr ? "Commission payée" : "Commission paid"}</p>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(sellerFinanceStats.commissionPaid, locale)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">{fr ? "Remboursements (mois)" : "Refunds (MTD)"}</p>
                  <p className="text-lg font-bold text-amber-600">{formatCurrency(sellerFinanceStats.refundAmount, locale)}</p>
                </div>
              </div>
              <Link href="/seller/finance" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline">
                {t("finance")} <ArrowUpRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
