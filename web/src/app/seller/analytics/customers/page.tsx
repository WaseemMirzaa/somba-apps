"use client";

import { useMemo } from "react";
import { Users, UserPlus, RefreshCw, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { SegmentDonut } from "@/components/charts/dashboard-charts";
import { AnalyticsPage } from "@/components/seller/analytics-shell";
import { EmptyState } from "@/components/seller/data-state";
import { StatTile } from "@/components/seller/stat-tile";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { formatCurrency } from "@/lib/utils";

export default function SellerCustomerAnalyticsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { sellerOrderList } = useSellerData();

  // Where the orders go (delivery city of the real orders; no personal data).
  const cities = useMemo(() => {
    const m = new Map<string, { city: string; orders: number; revenue: number }>();
    for (const o of sellerOrderList) {
      if (["cancelled", "returned", "pending"].includes(o.orderStatus)) continue;
      const city = o.customerCity === "—" ? (fr ? "Non renseignée" : "Not given") : o.customerCity;
      const cur = m.get(city) ?? { city, orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += o.amount;
      m.set(city, cur);
    }
    return [...m.values()].sort((x, y) => y.orders - x.orders);
  }, [sellerOrderList, fr]);

  return (
    <AnalyticsPage
      title={fr ? "Analytique clients" : "Customer Analytics"}
      subtitle={fr ? "Acheteurs nouveaux et fidèles · Villes" : "New and returning buyers · Cities"}
      crumb={fr ? "Clients" : "Customers"}
    >
      {(a, { periodLabel }) => {
        const c = a.customers;
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile title={fr ? "Acheteurs (total)" : "Buyers (all time)"} value={String(c.total)} icon={Users} />
              <StatTile title={fr ? "Acheteurs récurrents" : "Repeat buyers"} value={c.total > 0 ? `${c.repeatRatePct}%` : "—"} hint={fr ? `${c.repeat} ont commandé plusieurs fois` : `${c.repeat} ordered more than once`} icon={Repeat} />
              <StatTile title={fr ? "Nouveaux acheteurs" : "New buyers"} value={String(c.windowNew)} hint={periodLabel} icon={UserPlus} />
              <StatTile title={fr ? "Acheteurs fidèles" : "Returning buyers"} value={String(c.windowReturning)} hint={periodLabel} icon={RefreshCw} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-slate-900">{fr ? "Nouveaux et fidèles" : "New vs returning"}</h2>
                  <p className="text-xs text-slate-500">{fr ? `${c.windowActive} acheteurs actifs (${periodLabel})` : `${c.windowActive} active buyers (${periodLabel})`}</p>
                </CardHeader>
                <CardContent>
                  {c.windowActive === 0 ? (
                    <EmptyState>{fr ? "Aucun acheteur sur cette période." : "No buyers in this period."}</EmptyState>
                  ) : (
                    <SegmentDonut
                      segments={[
                        { label: fr ? "Nouveaux" : "New", pct: Math.round((c.windowNew / c.windowActive) * 100), color: "#1d4ed8" },
                        { label: fr ? "Fidèles" : "Returning", pct: Math.round((c.windowReturning / c.windowActive) * 100), color: "#059669" },
                      ]}
                    />
                  )}
                  <p className="mt-4 text-xs text-slate-500">
                    {fr
                      ? "« Nouveau » : première commande chez vous pendant la période. « Fidèle » : avait déjà acheté avant."
                      : "“New”: first order with your store inside the period. “Returning”: had bought before it."}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-slate-900">{fr ? "Villes de livraison" : "Delivery cities"}</h2>
                  <p className="text-xs text-slate-500">{fr ? "Vos ventes (hors annulées / retournées)" : "Your sales (excluding cancelled / returned)"}</p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    emptyMessage={fr ? "Aucune vente pour le moment." : "No sales yet."}
                    columns={[
                      { key: "city", label: fr ? "Ville" : "City" },
                      { key: "orders", label: fr ? "Commandes" : "Orders" },
                      { key: "revenue", label: fr ? "Revenu" : "Revenue", render: (r) => formatCurrency(r.revenue as number, locale) },
                    ]}
                    data={cities as unknown as Record<string, unknown>[]}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        );
      }}
    </AnalyticsPage>
  );
}
