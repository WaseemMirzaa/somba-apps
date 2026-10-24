"use client";

import Link from "next/link";
import { Package, CheckCircle2, Eye, ShoppingCart, Star } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { FunnelChart, HorizontalBarChart } from "@/components/charts/dashboard-charts";
import { AnalyticsPage } from "@/components/seller/analytics-shell";
import { EmptyState } from "@/components/seller/data-state";
import { StatTile } from "@/components/seller/stat-tile";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { localizedTopProducts } from "@/lib/seller-analytics";
import { productStatusLabel, productStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

export default function SellerProductAnalyticsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { sellerProductList, categoryRevenue, getRawProduct } = useSellerData();
  const live = sellerProductList.filter((p) => p.status === "live").length;

  return (
    <AnalyticsPage
      title={fr ? "Analytique produits" : "Product Analytics"}
      subtitle={fr ? "Meilleures ventes · Catalogue · Catégories" : "Best sellers · Catalogue · Categories"}
      crumb={fr ? "Produits" : "Products"}
    >
      {(a, { periodLabel }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile title={fr ? "Annonces" : "Listings"} value={String(sellerProductList.length)} icon={Package} />
            <StatTile title={fr ? "En ligne" : "Live"} value={String(live)} icon={CheckCircle2} />
            <StatTile title={fr ? "Vues produit" : "Product views"} value={String(a.funnel.views)} hint={periodLabel} icon={Eye} />
            <StatTile
              title={fr ? "Vues → commandes" : "Views → orders"}
              value={a.funnel.views > 0 ? `${a.funnel.conversionPct}%` : "—"}
              hint={fr ? `${a.funnel.orders} commandes · ${periodLabel}` : `${a.funnel.orders} orders · ${periodLabel}`}
              icon={ShoppingCart}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{fr ? "Meilleures ventes" : "Best sellers"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Unités vendues" : "Units sold"} · {periodLabel}</p>
              </CardHeader>
              <CardContent>
                {a.topProducts.length === 0 ? (
                  <EmptyState>{fr ? "Aucune vente sur cette période." : "No sales in this period."}</EmptyState>
                ) : (
                  <HorizontalBarChart
                    items={localizedTopProducts(a.topProducts, getRawProduct, fr).map((p) => ({ name: p.name, units: p.units }))}
                    valueKey="units"
                    labelKey="name"
                    maxBars={10}
                    formatValue={(v) => (fr ? `${v} vendus` : `${v} sold`)}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{fr ? "Vues produit et commandes" : "Product views vs orders"}</h2>
                <p className="text-xs text-slate-500">
                  {fr
                    ? "Au niveau de la boutique : les vues ne sont pas comptées par produit, ni les étapes panier / paiement."
                    : "Store-wide: views are not counted per product, and cart / checkout steps are not tracked."}
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

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{fr ? "Catalogue" : "Catalogue"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Ventes cumulées de chaque annonce" : "All-time sales of each listing"}</p>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                emptyMessage={fr ? "Aucune annonce." : "No listings yet."}
                columns={[
                  { key: "name", label: fr ? "Produit" : "Product", primary: true, render: (r) => <Link href={`/seller/products/${r.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(r.name)}</Link> },
                  { key: "status", label: fr ? "Statut" : "Status", render: (r) => <Badge variant={productStatusVariant(String(r.status))}>{productStatusLabel(String(r.status), fr)}</Badge> },
                  { key: "price", label: fr ? "Prix" : "Price", render: (r) => formatCurrency(r.price as number, locale) },
                  { key: "soldCount", label: fr ? "Vendus" : "Sold" },
                  { key: "revenue", label: fr ? "Revenu" : "Revenue", render: (r) => formatCurrency(r.revenue as number, locale) },
                  { key: "rating", label: fr ? "Note" : "Rating", render: (r) => (Number(r.rating) > 0 ? <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(r.rating).toFixed(1)} ({String(r.reviewsCount)})</span> : "—") },
                  { key: "availableStock", label: "Stock" },
                ]}
                data={[...sellerProductList].sort((x, y) => y.revenue - x.revenue) as unknown as Record<string, unknown>[]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{fr ? "Revenu par catégorie" : "Revenue by category"}</h2>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                emptyMessage={fr ? "Aucune vente pour le moment." : "No sales yet."}
                columns={[
                  { key: "category", label: fr ? "Catégorie" : "Category", render: (r) => String(fr ? r.categoryFr : r.category) },
                  { key: "orders", label: fr ? "Commandes" : "Orders" },
                  { key: "gross", label: fr ? "Revenu" : "Revenue", render: (r) => formatCurrency(r.gross as number, locale) },
                  { key: "net", label: fr ? "Net après commission" : "Net after commission", render: (r) => formatCurrency(r.net as number, locale) },
                ]}
                data={categoryRevenue as unknown as Record<string, unknown>[]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </AnalyticsPage>
  );
}
