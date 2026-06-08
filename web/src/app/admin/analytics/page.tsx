"use client";

import { BarChart3, TrendingUp, Users, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useLocale } from "@/context/locale-context";
import { formatCurrency, formatNumber } from "@/lib/utils";

const topCategories = [
  { name: "Electronics", orders: 1240, revenue: 890000 },
  { name: "Fashion", orders: 980, revenue: 420000 },
  { name: "Home & Living", orders: 650, revenue: 310000 },
  { name: "Beauty", orders: 520, revenue: 180000 },
];

export default function AdminAnalyticsPage() {
  const { t, locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("analytics")}
        subtitle="Platform performance overview"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: t("analytics") }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="GMV (30d)" value={formatCurrency(12400000, locale)} icon={TrendingUp} trend="+14.3%" />
        <StatCard title={t("orders")} value={formatNumber(18420, locale)} icon={ShoppingCart} trend="+9.1%" />
        <StatCard title={t("activeSellers")} value="1,247" icon={Users} />
        <StatCard title="Conversion Rate" value="3.8%" icon={BarChart3} trend="+0.4%" />
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-900">Top Categories</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          {topCategories.map((cat, i) => (
            <div key={cat.name} className="flex items-center gap-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="font-medium text-slate-900">{cat.name}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                    style={{ width: `${(cat.orders / 1240) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-slate-900">{formatCurrency(cat.revenue, locale)}</p>
                <p className="text-xs text-slate-500">{cat.orders} orders</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
