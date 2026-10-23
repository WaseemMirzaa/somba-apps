"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TrendingUp, ShoppingCart, Users, RotateCcw, Shield, DollarSign, ArrowUpRight, Percent, Receipt, Truck, Clock, PackageX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { StatCard } from "@/components/ui/stat-card";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { PeriodTabs, type PeriodDays } from "@/components/admin/period-tabs";
import { DailyBarChart, GroupedBarChart } from "@/components/admin/series-charts";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { HorizontalBarChart } from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useServerList, orderStatusLabel } from "@/lib/admin-live";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { rankSellers, shortDate, useSocketQuery, type AdminStatsFull, type RevenuePoint, type WarehouseStats } from "@/lib/admin-stats";
import type { Seller } from "@/lib/realtime/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface Zone {
  id: string;
  name: string;
  nameFr?: string;
}

function minutesLabel(m: number | null): string {
  if (m === null) return "—";
  if (m < 90) return `${Math.round(m)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export default function AdminAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const [days, setDays] = useState<PeriodDays>(30);
  const refreshKey = `${rt.orders.length}:${rt.deliveries.length}:${rt.disputes.length}`;
  const stats = useSocketQuery<AdminStatsFull>("analytics:admin", undefined, { refreshKey });
  const series = useSocketQuery<RevenuePoint[]>("analytics:revenue", { days }, { refreshKey });
  const wh = useSocketQuery<WarehouseStats>("analytics:warehouse", undefined, { refreshKey });
  const settings = useSocketQuery<Record<string, string>>("settings:get");
  const sellers = useServerList<Seller>("sellers:list", { pushEvents: ["seller:updated"] });

  const zoneName = useMemo(() => {
    const m = new Map<string, string>();
    try {
      const zones = JSON.parse(settings.data?.deliveryZones ?? "[]") as Zone[];
      for (const z of zones) m.set(z.id, fr ? z.nameFr || z.name : z.name);
    } catch {
      /* zone names are a nicety: ids are shown when the setting is unreadable */
    }
    return m;
  }, [settings.data, fr]);

  const s = stats.data;
  const w = wh.data;
  const top = useMemo(() => rankSellers(rt.orders, rt.products, sellers.items).slice(0, 8), [rt.orders, rt.products, sellers.items]);

  const returns = rt.disputes.filter((d) => d.type === "return");
  const disputes = rt.disputes.filter((d) => d.type === "dispute");
  const statusItems = s
    ? Object.entries(s.ordersByStatus)
        .filter(([, n]) => n > 0)
        .map(([status, n]) => ({ name: orderStatusLabel(status, fr), count: n }))
    : [];
  const change = s?.gmvChangePct;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("analytics")}
        subtitle={
          fr
            ? "Ventes, commandes, catégories, logistique, retours : chiffres calculés par le serveur"
            : "Sales, orders, categories, logistics, returns: figures computed by the server"
        }
        breadcrumbs={[adminBreadcrumb(locale), { label: t("analytics") }]}
        actions={<PeriodTabs value={days} onChange={setDays} />}
      />

      {stats.error && <SectionError message={stats.error} onRetry={stats.reload} />}
      {stats.loading && !s && !stats.error && <SectionLoading />}

      {s && (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <StatCard
            title={fr ? "GMV, 30 derniers jours" : "GMV, last 30 days"}
            value={formatCurrency(s.gmvLast30, locale)}
            icon={TrendingUp}
            trend={change === null || change === undefined ? (fr ? "pas de période précédente" : "no previous period") : `${change >= 0 ? "+" : ""}${change}% ${fr ? "vs 30 j précédents" : "vs previous 30 days"}`}
          />
          <StatCard title={fr ? "Commandes, 30 derniers jours" : "Orders, last 30 days"} value={formatNumber(s.ordersLast30, locale)} icon={ShoppingCart} trend={`${s.ordersToday} ${fr ? "aujourd'hui" : "today"}`} />
          <StatCard title={fr ? "Panier moyen" : "Average order value"} value={formatCurrency(s.aov, locale)} icon={DollarSign} />
          <StatCard title={fr ? "Remboursé" : "Refunded"} value={formatCurrency(s.refundsUsd, locale)} icon={Receipt} />
          <StatCard title="Commission" value={formatCurrency(s.commissionUsd, locale)} icon={Percent} trend={fr ? `Taux actuel ${s.commissionPct} % (nouvelles commandes)` : `Current rate ${s.commissionPct}% (new orders)`} />
          <StatCard title={fr ? "Clients" : "Customers"} value={formatNumber(s.customers, locale)} icon={Users} />
          <StatCard title={fr ? "Vendeurs" : "Sellers"} value={formatNumber(s.sellers, locale)} icon={Users} trend={`${formatNumber(s.liveProducts, locale)} ${fr ? "produits en ligne" : "live products"}`} />
          <StatCard title={fr ? "GMV total" : "GMV all time"} value={formatCurrency(s.gmv, locale)} icon={TrendingUp} trend={`${formatNumber(s.orders, locale)} ${fr ? "commandes" : "orders"}`} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{fr ? "Encaissements et commandes" : "Collected revenue & orders"}</h2>
            <p className="text-xs text-slate-500">{fr ? `Par jour (UTC) · ${days} derniers jours` : `Per day (UTC) · last ${days} days`}</p>
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
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Commandes par statut" : "Orders by status"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Toutes les commandes" : "All orders"}</p>
          </CardHeader>
          <CardContent>
            {!s ? (
              stats.error ? <SectionError message={stats.error} onRetry={stats.reload} /> : <SectionLoading />
            ) : statusItems.length === 0 ? (
              <EmptyState>{fr ? "Aucune commande." : "No orders yet."}</EmptyState>
            ) : (
              <HorizontalBarChart items={statusItems} valueKey="count" labelKey="name" maxBars={8} formatValue={(v) => String(v)} />
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
            {!s ? (
              stats.error ? <SectionError message={stats.error} onRetry={stats.reload} /> : <SectionLoading />
            ) : s.gmvByCategory.length === 0 ? (
              <EmptyState>{fr ? "Aucune vente pour le moment." : "No sales yet."}</EmptyState>
            ) : (
              <HorizontalBarChart
                items={s.gmvByCategory.map((c) => ({ name: `${c.category} · ${c.orders} ${fr ? "cmd" : "orders"}`, gmv: c.gmv }))}
                valueKey="gmv"
                labelKey="name"
                maxBars={10}
                formatValue={(v) => formatCurrency(v, locale)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Colis par zone de livraison" : "Parcels by delivery zone"}</h2>
            <p className="text-xs text-slate-500">{fr ? "30 derniers jours" : "Last 30 days"}</p>
          </CardHeader>
          <CardContent>
            {!w ? (
              wh.error ? <SectionError message={wh.error} onRetry={wh.reload} /> : <SectionLoading />
            ) : w.byZone.length === 0 ? (
              <EmptyState>{fr ? "Aucun colis sur la période." : "No parcels in the period."}</EmptyState>
            ) : (
              <HorizontalBarChart
                items={w.byZone.map((z) => ({ name: `${zoneName.get(z.zoneId) ?? z.zoneId} · ${z.delivered} ${fr ? "livrés" : "delivered"}, ${z.failed} ${fr ? "échecs" : "failed"}`, parcels: z.parcels }))}
                valueKey="parcels"
                labelKey="name"
                maxBars={10}
                formatValue={(v) => String(v)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{fr ? "Logistique" : "Logistics"}</h2>
          <p className="text-xs text-slate-500">{fr ? "Mouvements de colis des 7 derniers jours et délais" : "Parcel movement over the last 7 days and delivery times"}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {wh.error ? (
            <SectionError message={wh.error} onRetry={wh.reload} />
          ) : !w ? (
            <SectionLoading />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                <StatCard title={fr ? "Enlèvement → livraison" : "Pickup to delivery"} value={minutesLabel(w.avgPickupToDeliveryMinutes)} icon={Clock} trend={w.pickupToDeliverySamples ? `${w.pickupToDeliverySamples} ${fr ? "colis (30 j)" : "parcels (30 d)"}` : fr ? "pas assez de données" : "no sample yet"} />
                <StatCard title={fr ? "Taux d'échec" : "Failure rate"} value={w.failureRatePct === null ? "—" : `${w.failureRatePct}%`} icon={PackageX} trend={`${w.failed30} ${fr ? "échecs" : "failed"} · ${w.delivered30} ${fr ? "livrés (30 j)" : "delivered (30 d)"}`} />
                <StatCard title={fr ? "Ouverts depuis plus de 24 h" : "Open over 24 h"} value={formatNumber(w.agedOver24h, locale)} icon={Truck} />
                <StatCard title={fr ? "COD à collecter" : "COD to collect"} value={formatCurrency(w.codToCollect, locale)} icon={DollarSign} trend={`${w.unassigned} ${fr ? "non assignés" : "unassigned"} · ${w.inTransit} ${fr ? "en route" : "in transit"}`} />
              </div>
              <GroupedBarChart
                data={w.throughput.map((d) => ({ date: d.date, values: [d.received, d.pickedUp, d.delivered] }))}
                series={[
                  { label: fr ? "Reçus au hub" : "Received at hub", color: "#94a3b8" },
                  { label: fr ? "Enlevés" : "Picked up", color: "#3b82f6" },
                  { label: fr ? "Livrés" : "Delivered", color: "#10b981" },
                ]}
              />
              {w.byHub.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{fr ? "Lots d'expédition par hub (30 j)" : "Dispatch batches per hub (30 d)"}</h3>
                  <HorizontalBarChart items={w.byHub.map((h) => ({ name: h.hub, batches: h.batches30 }))} valueKey="batches" labelKey="name" formatValue={(v) => String(v)} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{fr ? "Top vendeurs" : "Top sellers"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Classement par chiffre d'affaires (hors annulées et retournées)" : "Ranked by revenue (excluding cancelled and returned)"}</p>
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
              data={top as unknown as Record<string, unknown>[]}
              emptyMessage={fr ? "Aucun vendeur" : "No sellers yet"}
              rowAction={(row) => <Link href={`/admin/sellers/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>}
            />
          )}
        </CardContent>
      </Card>

      <DetailGrid>
        <DetailGridSection title={fr ? "Retours" : "Returns"}>
          <InfoGrid
            items={[
              { label: fr ? "Demandes de retour" : "Return requests", value: returns.length },
              { label: fr ? "Ouvertes" : "Open", value: returns.filter((d) => d.status === "open").length },
              { label: fr ? "Résolues" : "Resolved", value: returns.filter((d) => d.status === "resolved").length },
              { label: fr ? "Rejetées" : "Rejected", value: returns.filter((d) => d.status === "rejected").length },
              { label: fr ? "Commandes retournées" : "Orders returned", value: s?.ordersByStatus.returned ?? 0 },
            ]}
          />
        </DetailGridSection>
        <DetailGridSection title={fr ? "Litiges" : "Disputes"}>
          <InfoGrid
            items={[
              { label: fr ? "Litiges" : "Disputes", value: disputes.length },
              { label: fr ? "Ouverts" : "Open", value: disputes.filter((d) => d.status === "open").length },
              { label: fr ? "Résolus" : "Resolved", value: disputes.filter((d) => d.status === "resolved").length },
              { label: fr ? "Rejetés" : "Rejected", value: disputes.filter((d) => d.status === "rejected").length },
            ]}
          />
        </DetailGridSection>
        <DetailGridSection title={fr ? "Alertes en cours" : "Open alerts"}>
          {!s ? (
            <SectionLoading />
          ) : s.alerts.length === 0 ? (
            <EmptyState>{fr ? "Aucune alerte." : "No open alerts."}</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm text-slate-700">
              {s.alerts.map((a) => (
                <li key={a.kind} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-2.5">
                  <span>{fr ? a.messageFr : a.message}</span>
                  <span className="font-bold text-slate-900">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailGridSection>
      </DetailGrid>

      <p className="text-xs text-slate-400">
        {fr
          ? `Dernier jour de la série : ${series.data?.length ? shortDate(series.data[series.data.length - 1].date, locale) : "—"} (UTC). Le taux de conversion et l'activité clients ne sont pas suivis par la plateforme et ne sont donc pas affichés.`
          : `Latest day in the series: ${series.data?.length ? shortDate(series.data[series.data.length - 1].date, locale) : "—"} (UTC). Conversion rate and customer activity are not tracked by the platform, so they are not shown.`}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/admin/sellers", label: fr ? "Vendeurs" : "Sellers", icon: Users },
          { href: "/admin/orders", label: t("orders"), icon: ShoppingCart },
          { href: "/admin/returns", label: fr ? "Retours" : "Returns", icon: RotateCcw },
          { href: "/admin/fraud", label: fr ? "Fraude" : "Fraud", icon: Shield },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center gap-3 rounded-xl border border-[var(--primary-tint)] p-4 transition-all hover:border-[var(--primary)] hover:bg-[var(--primary-light)]"
          >
            <div className="rounded-xl bg-red-50 p-2">
              <link.icon className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <span className="font-semibold text-slate-900">{link.label}</span>
            <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--primary)]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
