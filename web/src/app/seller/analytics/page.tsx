"use client";

import Link from "next/link";
import { TrendingUp, ShoppingCart, Target, Package, Users, DollarSign, Boxes, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DualMetricChart, HorizontalBarChart } from "@/components/charts/dashboard-charts";
import { AnalyticsPage } from "@/components/seller/analytics-shell";
import { EmptyState } from "@/components/seller/data-state";
import { StatTile } from "@/components/seller/stat-tile";
import { useLocale } from "@/context/locale-context";
import { shortDay } from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";

export default function SellerAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  const reportLinks = [
    { href: "/seller/analytics/products", label: fr ? "Analytique produits" : "Product Analytics", sub: fr ? "Meilleures ventes · Catalogue · Catégories" : "Best sellers · Catalogue · Categories", icon: Package },
    { href: "/seller/analytics/revenue", label: fr ? "Analytique revenus" : "Revenue Analytics", sub: fr ? "Par jour · Paiements · Transactions" : "By day · Payments · Transactions", icon: DollarSign },
    { href: "/seller/analytics/customers", label: fr ? "Analytique clients" : "Customer Analytics", sub: fr ? "Nouveaux · Fidèles · Villes" : "New · Returning · Cities", icon: Users },
    { href: "/seller/analytics/inventory", label: fr ? "Analytique inventaire" : "Inventory Analytics", sub: fr ? "Stock · Ruptures · Valeur" : "Stock · Stock-outs · Value", icon: Boxes },
  ];

  return (
    <AnalyticsPage
      title={t("analytics")}
      subtitle={fr ? "Chiffres réels de votre boutique, calculés par la plateforme" : "Real figures for your store, computed by the platform"}
    >
      {(a, { periodLabel }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile title={fr ? "Revenu" : "Revenue"} value={formatCurrency(a.revenue, locale)} spark={a.revenueSeries.map((d) => d.revenue)} icon={TrendingUp} />
            <StatTile title={fr ? "Commandes" : "Orders"} value={String(a.orders)} spark={a.revenueSeries.map((d) => d.orders)} icon={ShoppingCart} />
            <StatTile title={fr ? "Panier moyen" : "Avg. order value"} value={a.orders > 0 ? formatCurrency(a.aov, locale) : "—"} icon={Target} />
            <StatTile title={fr ? "Unités vendues" : "Units sold"} value={String(a.units)} icon={Package} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{fr ? "Revenu et commandes par jour" : "Revenue & orders per day"}</h2>
                <p className="text-xs text-slate-500">{periodLabel} · {fr ? "jours UTC" : "UTC days"}</p>
              </CardHeader>
              <CardContent>
                {a.orders === 0 ? (
                  <EmptyState>{fr ? "Aucune commande sur cette période." : "No orders in this period."}</EmptyState>
                ) : (
                  <DualMetricChart data={a.revenueSeries.map((d) => ({ label: shortDay(d.date, fr), revenue: d.revenue, orders: d.orders }))} height={240} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{fr ? "Meilleurs produits" : "Top products"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Unités vendues" : "Units sold"} · {periodLabel}</p>
              </CardHeader>
              <CardContent>
                {a.topProducts.length === 0 ? (
                  <EmptyState>{fr ? "Aucune vente sur cette période." : "No sales in this period."}</EmptyState>
                ) : (
                  <HorizontalBarChart
                    items={a.topProducts.map((p) => ({ name: p.name, units: p.units }))}
                    valueKey="units"
                    labelKey="name"
                    maxBars={8}
                    formatValue={(v) => (fr ? `${v} vendus` : `${v} sold`)}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {reportLinks.map((r) => (
              <Link key={r.href} href={r.href} className="card-premium flex items-center gap-4 p-5 transition-shadow hover:shadow-md">
                <span className="rounded-xl bg-blue-50 p-3 text-[var(--primary)]">
                  <r.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{r.label}</span>
                  <span className="block text-xs text-slate-500">{r.sub}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </div>
        </>
      )}
    </AnalyticsPage>
  );
}
