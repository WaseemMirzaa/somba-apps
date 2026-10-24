"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  Users,
  Target,
  RefreshCw,
  Wallet,
  Truck,
  ArrowUpRight,
  Activity,
  BarChart3,
  Star,
  XCircle,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import {
  SegmentDonut,
  FunnelChart,
  HorizontalBarChart,
} from "@/components/charts/dashboard-charts";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { GoalsCard } from "@/components/seller/goals-card";
import { RevenueOrdersChart } from "@/components/seller/revenue-chart";
import { StatTile } from "@/components/seller/stat-tile";
import { PlanSummary } from "@/components/seller/plan-summary";
import { useLocale } from "@/context/locale-context";
import { useSellerData, useSellerLoad } from "@/lib/seller";
import { packageStatusLabel, packageStatusVariant } from "@/lib/seller-labels";
import {
  HEALTH_LABELS,
  formatHours,
  healthValue,
  shortDay,
  localizedTopProducts,
  useSellerAnalytics,
  type AnalyticsDays,
} from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

const PERIODS: { label: string; days: AnalyticsDays }[] = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

/** "3 min ago" / "il y a 3 min" for the activity feed. */
function ago(iso: string, fr: boolean): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return fr ? "à l'instant" : "just now";
  if (mins < 60) return fr ? `il y a ${mins} min` : `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return fr ? `il y a ${h} h` : `${h} h ago`;
  return fr ? `il y a ${Math.round(h / 24)} j` : `${Math.round(h / 24)} d ago`;
}

export default function SellerDashboard() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [days, setDays] = useState<AnalyticsDays>(30);
  const {
    sellerStore,
    sellerDashboardStats,
    sellerOrderList,
    lowStockProducts,
    promotionList,
    sellerFinanceStats,
    categoryRevenue,
    recentActivity,
    getRawProduct,
  } = useSellerData();
  const load = useSellerLoad();
  const an = useSellerAnalytics(days);
  const s = sellerDashboardStats;
  const a = an.data;
  const needsPickup = !sellerStore.pickupAddress;
  const periodLabel = fr ? `${days} derniers jours` : `last ${days} days`;

  const quickActions = [
    { href: "/seller/orders", label: t("orders"), sub: fr ? `${s.pendingOrders} en attente` : `${s.pendingOrders} pending`, icon: ShoppingCart, color: "bg-blue-50 text-blue-700" },
    { href: "/seller/products/create", label: t("createProduct"), sub: fr ? "Ajouter une annonce" : "Add listing", icon: Package, color: "bg-emerald-50 text-emerald-700" },
    { href: "/seller/finance/payouts/request", label: fr ? "Demander un paiement" : "Request payout", sub: formatCurrency(sellerFinanceStats.availableBalance, locale), icon: Wallet, color: "bg-violet-50 text-violet-700" },
    { href: "/seller/promotions/create", label: fr ? "Demander une promotion" : "Request promotion", sub: fr ? "Booster les ventes" : "Boost sales", icon: TrendingUp, color: "bg-amber-50 text-amber-700" },
  ];

  const series = a?.revenueSeries.map((d) => ({ label: shortDay(d.date, fr), revenue: d.revenue, orders: d.orders })) ?? [];
  const openShipments = sellerOrderList.filter((o) => !["pending", "delivered", "cancelled", "returned"].includes(o.packageStatus)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={sellerStore.name}
        subtitle={
          (fr ? `${t("welcome")}, ${sellerStore.owner} · ${sellerStore.badge}` : `${t("welcome")}, ${sellerStore.owner} · ${sellerStore.badge}`) +
          (Number(sellerStore.rating) > 0 ? ` · ⭐ ${Number(sellerStore.rating).toFixed(1)}` : "")
        }
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

      {load.error && <LoadError message={load.error} onRetry={load.retry} />}

      {needsPickup && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <strong>{fr ? "Les livreurs ont besoin de votre adresse de collecte." : "Riders need your pickup address."}</strong>{" "}
            {fr ? "Sans elle, vos colis ne peuvent pas être collectés." : "Without it your parcels cannot be collected."}
          </span>
          <Link href="/seller/settings" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">
            {fr ? "Ajouter l'adresse" : "Add pickup address"}
          </Link>
        </div>
      )}

      <PlanSummary />

      {/* Period + analytics state */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">
          {fr ? "Performance" : "Performance"} <span className="text-sm font-medium text-slate-500">· {periodLabel}</span>
        </h2>
        <div className="flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label={fr ? "Période" : "Period"}>
          {PERIODS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={days === p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                days === p.days ? "bg-[var(--primary)] text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {an.error && <LoadError message={an.error} onRetry={an.retry} />}
      {an.loading && !a && <SectionLoader />}

      {a && (
        <>
          {/* KPI grid */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile title={fr ? "Revenu" : "Revenue"} value={formatCurrency(a.revenue, locale)} icon={DollarSign} />
            <StatTile title={fr ? "Commandes" : "Orders"} value={String(a.orders)} hint={fr ? `${a.units} unités vendues` : `${a.units} units sold`} icon={ShoppingCart} />
            <StatTile title={fr ? "Panier moyen" : "Avg. order value"} value={a.orders > 0 ? formatCurrency(a.aov, locale) : "—"} icon={Target} />
            <StatTile
              title={fr ? "Vues produit → commandes" : "Product views → orders"}
              value={a.funnel.views > 0 ? `${a.funnel.conversionPct}%` : "—"}
              hint={fr ? `${a.funnel.views} vues · ${a.funnel.orders} commandes` : `${a.funnel.views} views · ${a.funnel.orders} orders`}
              icon={BarChart3}
            />
            <StatTile
              title={fr ? "Acheteurs récurrents" : "Repeat buyers"}
              value={a.customers.total > 0 ? `${a.customers.repeatRatePct}%` : "—"}
              hint={fr ? `${a.customers.repeat} sur ${a.customers.total} acheteurs` : `${a.customers.repeat} of ${a.customers.total} buyers`}
              icon={RefreshCw}
            />
            <StatTile
              title={fr ? "Clients actifs" : "Active customers"}
              value={String(a.customers.windowActive)}
              hint={fr ? `${a.customers.windowNew} nouveaux · ${a.customers.windowReturning} fidèles` : `${a.customers.windowNew} new · ${a.customers.windowReturning} returning`}
              icon={Users}
            />
            <StatTile
              title={fr ? "Taux d'annulation" : "Cancellation rate"}
              value={a.fulfilment.ordersPlaced > 0 ? `${a.fulfilment.cancelRatePct}%` : "—"}
              hint={fr ? `${a.fulfilment.ordersPlaced} commandes passées` : `${a.fulfilment.ordersPlaced} orders placed`}
              icon={XCircle}
            />
            <StatTile
              title={fr ? "Note moyenne" : "Average rating"}
              value={a.reviews.average !== null ? `⭐ ${a.reviews.average.toFixed(1)}` : "—"}
              hint={fr ? `${a.reviews.count} avis · ${a.reviews.replied} avec réponse` : `${a.reviews.count} reviews · ${a.reviews.replied} replied`}
              icon={Star}
            />
          </div>

          {/* Main charts row */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{fr ? "Revenu et commandes" : "Revenue & orders"}</h2>
                <p className="text-xs text-slate-500">
                  {fr ? "Par jour (UTC), hors commandes annulées ou retournées · " : "Per day (UTC), excluding cancelled or returned orders · "}
                  {fr ? "gains nets (tout temps) " : "net earnings (all time) "}
                  {formatCurrency(sellerFinanceStats.revenue - sellerFinanceStats.commissionPaid, locale)}
                </p>
              </CardHeader>
              <CardContent>
                {a.orders === 0 ? (
                  <EmptyState>{fr ? "Aucune commande sur cette période." : "No orders in this period."}</EmptyState>
                ) : (
                  <RevenueOrdersChart data={series} height={240} />
                )}
              </CardContent>
            </Card>

            <GoalsCard />
          </div>

          {/* Customers + funnel */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{fr ? "Clients" : "Customers"}</h2>
                <p className="text-xs text-slate-500">
                  {fr ? `Acheteurs de la période (${periodLabel}) : nouveaux ou déjà clients` : `Buyers in the period (${periodLabel}): new or returning`}
                </p>
              </CardHeader>
              <CardContent>
                {a.customers.windowActive === 0 ? (
                  <EmptyState>{fr ? "Aucun acheteur sur cette période." : "No buyers in this period."}</EmptyState>
                ) : (
                  <SegmentDonut
                    segments={[
                      { label: fr ? "Nouveaux" : "New", pct: Math.round((a.customers.windowNew / a.customers.windowActive) * 100), color: "#1d4ed8" },
                      { label: fr ? "Fidèles" : "Returning", pct: Math.round((a.customers.windowReturning / a.customers.windowActive) * 100), color: "#059669" },
                    ]}
                  />
                )}
                <div className="mt-4 flex gap-4 rounded-xl bg-slate-50 p-4 text-center text-sm">
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{a.customers.total}</p>
                    <p className="text-xs text-slate-500">{fr ? "Acheteurs (total)" : "Buyers (all time)"}</p>
                  </div>
                  <div className="w-px bg-slate-200" />
                  <div className="flex-1">
                    <p className="font-bold text-emerald-600">{a.customers.repeat}</p>
                    <p className="text-xs text-slate-500">{fr ? "Plusieurs commandes" : "Ordered more than once"}</p>
                  </div>
                  <div className="w-px bg-slate-200" />
                  <div className="flex-1">
                    <p className="font-bold text-[var(--primary)]">{a.customers.repeatRatePct}%</p>
                    <p className="text-xs text-slate-500">{fr ? "Taux de récurrence" : "Repeat rate"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{fr ? "Vues produit et commandes" : "Product views vs orders"}</h2>
                <p className="text-xs text-slate-500">
                  {fr
                    ? "Pages produit ouvertes par des clients et visiteurs, comparées aux commandes passées. Les étapes panier et paiement ne sont pas suivies."
                    : "Product pages opened by shoppers and visitors, against orders placed. Cart and checkout steps are not tracked."}
                </p>
              </CardHeader>
              <CardContent>
                {a.funnel.views === 0 && a.funnel.orders === 0 ? (
                  <EmptyState>{fr ? "Pas encore de vues enregistrées sur cette période." : "No views recorded in this period yet."}</EmptyState>
                ) : (
                  <FunnelChart
                    stages={[
                      { stage: fr ? "Vues produit" : "Product views", count: a.funnel.views, pct: 100 },
                      { stage: fr ? "Commandes" : "Orders", count: a.funnel.orders, pct: a.funnel.views > 0 ? a.funnel.conversionPct : 0 },
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Health + fulfilment + quick actions */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{fr ? "Score de santé de la boutique" : "Store health score"}</h2>
                {a.health.score !== null ? (
                  <p className="text-3xl font-bold text-[var(--primary)]">
                    {a.health.score}/100 <span className="text-lg text-slate-500">· {fr ? "note" : "grade"} {a.health.grade}</span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">{fr ? "Pas assez d'activité pour calculer un score." : "Not enough activity to score yet."}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {a.health.components.map((h) => {
                  const [en, frl] = HEALTH_LABELS[h.key] ?? [h.key, h.key];
                  return (
                    <div key={h.key}>
                      <div className="mb-1 flex justify-between gap-2 text-xs">
                        <span className="text-slate-600">{fr ? frl : en} <span className="text-slate-400">({healthValue(h.key, h.value, fr)})</span></span>
                        <span className="font-bold text-slate-900">{h.score}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${h.score}%` }} />
                      </div>
                    </div>
                  );
                })}
                {a.health.components.length > 0 && (
                  <p className="pt-1 text-[11px] text-slate-400">
                    {fr ? "Calculé par la plateforme à partir de vos commandes, avis et retours." : "Computed by the platform from your orders, reviews and returns."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{fr ? "Indicateurs de traitement" : "Fulfilment metrics"}</h2>
                <p className="text-xs text-slate-500">{fr ? `Commandes passées (${periodLabel})` : `Orders placed (${periodLabel})`}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: fr ? "Délai de préparation" : "Time to pack", value: formatHours(a.fulfilment.avgHoursToReady, fr) },
                    { label: fr ? "Délai de livraison" : "Time to deliver", value: formatHours(a.fulfilment.avgHoursToDelivered, fr) },
                    { label: fr ? "Retours" : "Returns", value: a.fulfilment.ordersPlaced > 0 ? `${a.fulfilment.returnRatePct}%` : "—" },
                    { label: fr ? "Litiges" : "Disputes", value: a.fulfilment.ordersPlaced > 0 ? `${a.fulfilment.disputeRatePct}%` : "—" },
                    { label: fr ? "Annulations" : "Cancellations", value: a.fulfilment.ordersPlaced > 0 ? `${a.fulfilment.cancelRatePct}%` : "—" },
                    { label: fr ? "Commandes ouvertes" : "Open orders", value: String(openShipments) },
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
                {quickActions.map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <div className={cn("rounded-lg p-2", q.color)}>
                      <q.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{q.label}</p>
                      <p className="text-xs text-slate-500">{q.sub}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-400" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Category revenue */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{fr ? "Chiffre d'affaires par catégorie" : "Revenue by category"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Toutes vos ventes (hors annulées / retournées)" : "All your sales (excluding cancelled / returned)"}</p>
            </CardHeader>
            <CardContent>
              {categoryRevenue.length === 0 ? (
                <EmptyState>{fr ? "Aucune vente pour le moment." : "No sales yet."}</EmptyState>
              ) : (
                <HorizontalBarChart
                  items={categoryRevenue.map((c) => ({ name: fr ? c.categoryFr : c.category, revenue: c.gross }))}
                  valueKey="revenue"
                  labelKey="name"
                  formatValue={(v) => formatCurrency(v, locale)}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Products chart + activity + orders */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Meilleurs produits" : "Top products"}</h2>
              <p className="text-xs text-slate-500">{periodLabel}</p>
            </div>
            <NavLinkButton href="/seller/analytics/products">{fr ? "Détails" : "Details"}</NavLinkButton>
          </CardHeader>
          <CardContent>
            {!a || a.topProducts.length === 0 ? (
              <EmptyState>{a ? (fr ? "Aucune vente sur cette période." : "No sales in this period.") : fr ? "Chargement…" : "Loading…"}</EmptyState>
            ) : (
              <HorizontalBarChart
                items={localizedTopProducts(a.topProducts, getRawProduct, fr).map((p) => ({ name: p.name, sold: p.units }))}
                valueKey="sold"
                labelKey="name"
                formatValue={(v) => (fr ? `${v} vendus` : `${v} sold`)}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold text-slate-900">{fr ? "Activité récente" : "Recent activity"}</h2>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState>{fr ? "Rien pour le moment." : "Nothing yet."}</EmptyState>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((e, i) => (
                  <li key={`${e.kind}-${e.at}-${i}`} className="flex gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                    <div className="min-w-0">
                      <Link href={e.href} className="block break-words text-sm text-slate-800 hover:text-[var(--primary)]">{fr ? e.textFr : e.text}</Link>
                      <p className="text-xs text-slate-400">{ago(e.at, fr)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("lowStock")}</h2>
            <NavLinkButton href="/seller/inventory">{t("viewAll")}</NavLinkButton>
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
              emptyMessage={fr ? "Aucun produit en stock bas." : "No low-stock products."}
              rowAction={(row) => (
                <Link href={`/seller/products/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
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
            <NavLinkButton href="/seller/orders">{t("viewAll")}</NavLinkButton>
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
                { key: "packageStatus", label: t("status"), render: (row) => <Badge variant={packageStatusVariant(String(row.packageStatus))}>{packageStatusLabel(String(row.packageStatus), fr)}</Badge> },
              ]}
              data={sellerOrderList.slice(0, 5) as unknown as Record<string, unknown>[]}
              emptyMessage={fr ? "Aucune commande pour le moment." : "No orders yet."}
              rowAction={(row) => (
                <Link href={`/seller/orders/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="font-semibold text-slate-900">{fr ? "Promotions actives" : "Active promotions"}</h2>
              <NavLinkButton href="/seller/promotions">{t("viewAll")}</NavLinkButton>
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
                                  ]}
                data={promotionList.filter((p) => p.status === "active") as unknown as Record<string, unknown>[]}
                emptyMessage={fr ? "Aucune promotion active." : "No active promotions."}
                rowAction={(row) => (
                  <Link href={`/seller/promotions/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
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
                  <p className="text-xs text-slate-500">{fr ? "Annulées / retournées" : "Cancelled / returned"}</p>
                  <p className="text-lg font-bold text-amber-600">{formatCurrency(sellerFinanceStats.refundAmount, locale)}</p>
                </div>
              </div>
              <NavLinkButton href="/seller/finance" className="mt-4">
                {t("finance")} <ArrowUpRight className="h-4 w-4" />
              </NavLinkButton>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
