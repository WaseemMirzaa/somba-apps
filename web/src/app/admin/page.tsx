"use client";

import { localDateTime } from "@/lib/dates";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ShoppingCart,
  DollarSign,
  Users,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  RotateCcw,
  ArrowUpRight,
  Activity,
  Shield,
  Wallet,
  Scale,
  Package,
  Percent,
  Receipt,
  Truck,
  CreditCard,
  Store,
  ClipboardCheck,
  PackageX,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { StatCard } from "@/components/ui/stat-card";
import { SellerStatusActions } from "@/components/admin/status-actions";
import { PeriodTabs, type PeriodDays } from "@/components/admin/period-tabs";
import { DailyBarChart } from "@/components/admin/series-charts";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { HorizontalBarChart } from "@/components/charts/dashboard-charts";
import { useRealtime } from "@/context/realtime-context";
import { categoryLabel } from "@/lib/i18n-fields";
import { useLocale } from "@/context/locale-context";
import { ORDER_STATUS_BADGE, orderStatusLabel, useServerList } from "@/lib/admin-live";
import { rankSellers, useSocketQuery, type AdminStatsFull, type RevenuePoint } from "@/lib/admin-stats";
import type { Seller } from "@/lib/realtime/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

const SELLER_STATUS_FR: Record<string, string> = { pending: "En attente", approved: "Approuvé", suspended: "Suspendu", rejected: "Rejeté" };
const SEVERITY_VARIANT = { critical: "danger", warning: "warning", info: "info" } as const;
const SEVERITY_LABEL = {
  critical: { en: "Critical", fr: "Critique" },
  warning: { en: "Warning", fr: "Attention" },
  info: { en: "Info", fr: "Info" },
} as const;

/** Where each server alert is handled. */
const ALERT_TARGET: Record<string, { href: string; icon: typeof Truck }> = {
  unassigned_deliveries: { href: "/admin/fulfillment/deliveries", icon: Truck },
  pending_payments: { href: "/admin/finance", icon: CreditCard },
  open_disputes: { href: "/admin/disputes", icon: Scale },
  payout_requests: { href: "/admin/payouts", icon: Wallet },
  out_of_stock: { href: "/admin/products", icon: PackageX },
  low_stock: { href: "/admin/products", icon: Package },
  products_pending_moderation: { href: "/admin/moderation", icon: ClipboardCheck },
  sellers_pending: { href: "/admin/sellers", icon: Store },
};

interface AuditItem {
  id: string;
  actor: string;
  action: string;
  entity: string;
  createdAt?: string;
  timestamp?: string;
}
interface FraudItem {
  id: string;
  status: string;
}

export default function AdminDashboard() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const [days, setDays] = useState<PeriodDays>(30);

  // Re-fetch the figures when the live order / payment feed changes.
  const refreshKey = `${rt.orders.length}:${rt.payments.length}:${rt.payouts.length}:${rt.disputes.length}`;
  const stats = useSocketQuery<AdminStatsFull>("analytics:admin", undefined, { refreshKey });
  const series = useSocketQuery<RevenuePoint[]>("analytics:revenue", { days }, { refreshKey });
  const sellers = useServerList<Seller>("sellers:list", { pushEvents: ["seller:updated"] });
  const audit = useServerList<AuditItem>("audit:list", { pushEvents: ["audit:created"] });
  const fraud = useServerList<FraudItem>("fraud:list", { pushEvents: ["fraud:created", "fraud:updated"] });

  const s = stats.data;
  const openFraud = fraud.items.filter((f) => f.status === "open").length;
  const pendingSellers = sellers.items.filter((x) => x.status === "pending").length;

  const topSellers = useMemo(() => rankSellers(rt.orders, rt.products, sellers.items).slice(0, 5), [rt.orders, rt.products, sellers.items]);

  const queue = useMemo(
    () => [...sellers.items].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending")).slice(0, 8),
    [sellers.items],
  );

  const orderRows = rt.orders.slice(0, 5).map((o) => ({ id: o.id, reference: o.reference, customer: o.customerName, amount: o.totalUsd, status: o.status }));

  const quickLinks = [
    { href: "/admin/orders", label: t("orders"), sub: `${formatNumber(s?.orders ?? rt.orders.length, locale)} ${fr ? "au total" : "total"}`, icon: ShoppingCart },
    { href: "/admin/sellers", label: t("sellers"), sub: `${pendingSellers} ${fr ? "en attente" : "pending"}`, icon: Users },
    { href: "/admin/payouts", label: fr ? "Versements" : "Payouts", sub: `${rt.payouts.filter((p) => p.status === "requested").length} ${fr ? "à traiter" : "to process"}`, icon: Wallet },
    { href: "/admin/fraud", label: fr ? "Fraude" : "Fraud", sub: `${openFraud} ${fr ? "alertes ouvertes" : "open flags"}`, icon: Shield },
    { href: "/admin/returns", label: fr ? "Retours" : "Returns", sub: `${rt.disputes.filter((d) => d.type === "return" && d.status === "open").length} ${fr ? "ouverts" : "open"}`, icon: RotateCcw },
    { href: "/admin/disputes", label: fr ? "Litiges" : "Disputes", sub: `${s?.pendingDisputes ?? rt.disputes.filter((d) => d.status === "open").length} ${fr ? "ouverts" : "open"}`, icon: Scale },
    { href: "/admin/moderation", label: fr ? "Modération" : "Moderation", sub: fr ? "File des produits" : "Product queue", icon: Package },
    { href: "/admin/analytics", label: t("analytics"), sub: fr ? "Analyse détaillée" : "Deep dive", icon: BarChart3 },
  ];

  const change = s?.gmvChangePct;
  const changeLabel =
    change === null || change === undefined
      ? fr ? "pas de période précédente" : "no previous period"
      : `${change >= 0 ? "+" : ""}${change}% ${fr ? "vs 30 j précédents" : "vs previous 30 days"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Tableau de bord marketplace" : "Marketplace dashboard"}
        subtitle={
          s
            ? fr
              ? `${formatNumber(s.orders, locale)} commande${s.orders > 1 ? "s" : ""} · ${formatNumber(s.customers, locale)} client${s.customers > 1 ? "s" : ""} · ${formatNumber(s.sellers, locale)} vendeur${s.sellers > 1 ? "s" : ""}`
              : `${formatNumber(s.orders, locale)} order${s.orders === 1 ? "" : "s"} · ${formatNumber(s.customers, locale)} customer${s.customers === 1 ? "" : "s"} · ${formatNumber(s.sellers, locale)} seller${s.sellers === 1 ? "" : "s"}`
            : fr ? "Chargement des indicateurs…" : "Loading figures…"
        }
        actions={
          <Link href="/admin/sellers" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
            {fr ? "Vendeurs à approuver" : "Sellers to approve"}
          </Link>
        }
      />

      {stats.error && <SectionError message={stats.error} onRetry={stats.reload} />}
      {stats.loading && !s && !stats.error && <SectionLoading />}

      {s && (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <StatCard title={fr ? "GMV, 30 derniers jours" : "GMV, last 30 days"} value={formatCurrency(s.gmvLast30, locale)} icon={DollarSign} trend={changeLabel} />
          <StatCard title={fr ? "Commandes, 30 derniers jours" : "Orders, last 30 days"} value={formatNumber(s.ordersLast30, locale)} icon={ShoppingCart} trend={`${formatNumber(s.ordersToday, locale)} ${fr ? "aujourd'hui" : "today"} · ${formatCurrency(s.gmvToday, locale)}`} />
          <StatCard title={fr ? "GMV, total" : "GMV, all time"} value={formatCurrency(s.gmv, locale)} icon={TrendingUp} trend={`${fr ? "Panier moyen" : "Avg. order"} ${formatCurrency(s.aov, locale)}`} />
          <StatCard title={fr ? "Encaissé" : "Collected revenue"} value={formatCurrency(s.revenue, locale)} icon={Receipt} trend={`${fr ? "Remboursé" : "Refunded"} ${formatCurrency(s.refundsUsd, locale)}`} />
          <StatCard title="Commission" value={formatCurrency(s.commissionUsd, locale)} icon={Percent} trend={fr ? `Taux actuel ${s.commissionPct} % (nouvelles commandes)` : `Current rate ${s.commissionPct}% (new orders)`} />
          <StatCard title={fr ? "Abonnements vendeurs" : "Seller subscriptions"} value={formatCurrency(s.subscriptionRevenueUsd, locale)} icon={Wallet} />
          <StatCard title={fr ? "Clients" : "Customers"} value={formatNumber(s.customers, locale)} icon={Users} />
          <StatCard title={fr ? "Produits en ligne" : "Live products"} value={formatNumber(s.liveProducts, locale)} icon={Package} trend={`${formatNumber(s.sellers, locale)} ${fr ? (s.sellers > 1 ? "vendeurs" : "vendeur") : s.sellers === 1 ? "seller" : "sellers"}`} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{fr ? "Encaissements et commandes" : "Collected revenue & orders"}</h2>
              <p className="text-xs text-slate-500">{fr ? `Par jour (UTC) · ${days} derniers jours` : `Per day (UTC) · last ${days} days`}</p>
            </div>
            <PeriodTabs value={days} onChange={setDays} />
          </CardHeader>
          <CardContent>
            {series.error ? (
              <SectionError message={series.error} onRetry={series.reload} />
            ) : series.loading && !series.data ? (
              <SectionLoading />
            ) : (
              <DailyBarChart
                data={(series.data ?? []).map((d) => ({ date: d.date, value: d.revenue, secondary: d.orders }))}
                valueLabel={fr ? "Encaissé (USD)" : "Collected (USD)"}
                secondaryLabel={fr ? "Commandes" : "Orders"}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Alertes opérationnelles" : "Operational alerts"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Calculées par le serveur" : "Computed by the server"}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.error ? (
              <SectionError message={stats.error} onRetry={stats.reload} />
            ) : !s ? (
              <SectionLoading />
            ) : s.alerts.length === 0 ? (
              <EmptyState>{fr ? "Rien à signaler : aucune alerte ouverte." : "All clear: no open alerts."}</EmptyState>
            ) : (
              s.alerts.map((alert) => {
                const target = ALERT_TARGET[alert.kind] ?? { href: "/admin", icon: AlertTriangle };
                const Icon = target.icon;
                return (
                  <Link
                    key={alert.kind}
                    href={target.href}
                    className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:border-[var(--primary-tint)] hover:bg-[var(--primary-light)]"
                  >
                    <div className={alert.severity === "critical" ? "rounded-lg bg-red-50 p-2" : "rounded-lg bg-amber-50 p-2"}>
                      <Icon className={alert.severity === "critical" ? "h-4 w-4 text-red-600" : "h-4 w-4 text-amber-600"} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={SEVERITY_VARIANT[alert.severity]}>{fr ? SEVERITY_LABEL[alert.severity].fr : SEVERITY_LABEL[alert.severity].en}</Badge>
                        <span className="text-xs font-bold text-slate-900">{alert.count}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{fr ? alert.messageFr : alert.message}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "GMV par catégorie" : "GMV by category"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Valeur des articles, commandes non annulées" : "Item value on non-cancelled orders"}</p>
          </CardHeader>
          <CardContent>
            {stats.error ? (
              <SectionError message={stats.error} onRetry={stats.reload} />
            ) : !s ? (
              <SectionLoading />
            ) : s.gmvByCategory.length === 0 ? (
              <EmptyState>{fr ? "Aucune vente pour le moment." : "No sales yet."}</EmptyState>
            ) : (
              <HorizontalBarChart
                items={s.gmvByCategory.map((c) => ({ name: `${categoryLabel(rt.categories, c.category, fr)} · ${c.orders} ${fr ? "cmd" : "orders"}`, gmv: c.gmv }))}
                valueKey="gmv"
                labelKey="name"
                maxBars={8}
                formatValue={(v) => formatCurrency(v, locale)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Actions en attente" : "Pending actions"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Volumes en direct" : "Live counts"}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { href: "/admin/sellers", label: fr ? "Vendeurs à approuver" : "Sellers to approve", count: pendingSellers, err: sellers.error },
              { href: "/admin/payouts", label: fr ? "Versements demandés" : "Payouts requested", count: rt.payouts.filter((p) => p.status === "requested").length },
              { href: "/admin/disputes", label: fr ? "Litiges ouverts" : "Open disputes", count: s?.pendingDisputes ?? rt.disputes.filter((d) => d.status === "open").length },
              { href: "/admin/fraud", label: fr ? "Alertes fraude ouvertes" : "Open fraud alerts", count: openFraud, err: fraud.error },
            ].map((action) => (
              <Link key={action.href} href={action.href} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:border-[var(--primary-tint)]">
                <span className="text-sm text-slate-700">{action.label}</span>
                <span className="font-bold text-slate-900">{action.err ? "!" : action.count}</span>
              </Link>
            ))}
            {(sellers.error || fraud.error) && <SectionError message={sellers.error ?? fraud.error ?? ""} onRetry={() => { void sellers.reload(); void fraud.reload(); }} />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Top vendeurs" : "Top sellers"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Classés par chiffre d'affaires (hors annulées et retournées)" : "Ranked by revenue (excluding cancelled and returned)"}</p>
            </div>
            <NavLinkButton href="/admin/sellers">{t("viewAll")}</NavLinkButton>
          </CardHeader>
          <CardContent className="p-0">
            {sellers.error ? (
              <div className="p-4"><SectionError message={sellers.error} onRetry={sellers.reload} /></div>
            ) : sellers.loading ? (
              <SectionLoading />
            ) : (
              <DataTable
                columns={[
                  {
                    key: "name",
                    label: fr ? "Vendeur" : "Seller",
                    render: (row) => (
                      <Link href={`/admin/sellers/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                        {String(row.name)}
                      </Link>
                    ),
                  },
                  { key: "revenue", label: fr ? "Chiffre d'affaires" : "Revenue", render: (row) => formatCurrency(row.revenue as number, locale) },
                  { key: "orderCount", label: t("orders") },
                  { key: "rating", label: fr ? "Note" : "Rating", render: (row) => (Number(row.rating) > 0 ? `★ ${Number(row.rating).toFixed(1)}` : "—") },
                ]}
                data={topSellers as unknown as Record<string, unknown>[]}
                emptyMessage={fr ? "Aucun vendeur" : "No sellers yet"}
                rowAction={(row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold text-slate-900">{fr ? "Activité récente (journal d'audit)" : "Recent activity (audit log)"}</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {audit.error ? (
              <SectionError message={audit.error} onRetry={audit.reload} />
            ) : audit.loading ? (
              <SectionLoading />
            ) : audit.items.length === 0 ? (
              <EmptyState>{fr ? "Aucune activité" : "No activity yet"}</EmptyState>
            ) : (
              audit.items.slice(0, 6).map((item) => (
                <div key={item.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <p className="text-xs text-slate-400">{item.timestamp ?? (item.createdAt ? localDateTime(item.createdAt) : "")}</p>
                  <p className="mt-1 break-words text-sm text-slate-700">{item.actor} · {item.action} · {item.entity}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center gap-3 rounded-xl border border-[var(--primary-tint)] p-4 transition-all hover:border-[var(--primary)] hover:bg-[var(--primary-light)]"
          >
            <div className="rounded-xl bg-red-50 p-2">
              <link.icon className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{link.label}</p>
              <p className="text-xs text-slate-500">{link.sub}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--primary)]" />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{t("recentOrders")}</h2>
              <NavLinkButton href="/admin/orders">{t("viewAll")}</NavLinkButton>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "reference",
                  label: "ID",
                  render: (row) => (
                    <Link href={`/admin/orders/${row.reference}`} className="text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
                  ),
                },
                { key: "customer", label: t("customer") },
                { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => (
                    <Badge variant={ORDER_STATUS_BADGE[row.status as string] ?? "default"}>
                      {orderStatusLabel(String(row.status), fr)}
                    </Badge>
                  ),
                },
              ]}
              data={orderRows as unknown as Record<string, unknown>[]}
              emptyMessage={fr ? "Aucune commande" : "No orders yet"}
              rowAction={(row) => (
                <Link href={`/admin/orders/${row.reference}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{t("sellerQueue")}</h2>
              <NavLinkButton href="/admin/sellers">{t("viewAll")}</NavLinkButton>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {sellers.error ? (
              <div className="p-4"><SectionError message={sellers.error} onRetry={sellers.reload} /></div>
            ) : (
              <DataTable
                columns={[
                  {
                    key: "name",
                    label: fr ? "Boutique" : "Store",
                    render: (row) => (
                      <Link href={`/admin/sellers/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.name)}</Link>
                    ),
                  },
                  {
                    key: "status",
                    label: t("status"),
                    render: (row) => (
                      <Badge variant={row.status === "approved" ? "success" : row.status === "pending" ? "warning" : "danger"}>
                        {fr ? (SELLER_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}
                      </Badge>
                    ),
                  },
                  {
                    key: "action",
                    label: t("action"),
                    render: (row) =>
                      row.status === "pending" ? (
                        <SellerStatusActions sellerId={String(row.id)} status="pending" name={String(row.name)} />
                      ) : (
                        <Link href={`/admin/sellers/${row.id}`} className="text-xs font-medium text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
                      ),
                  },
                ]}
                data={queue as unknown as Record<string, unknown>[]}
                emptyMessage={fr ? "Aucun vendeur" : "No sellers yet"}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
