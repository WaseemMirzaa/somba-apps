"use client";

import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { TrendingUp, ShoppingCart, Target, Package } from "lucide-react";
import { topSellingProducts, sellerDashboardStats } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerAnalyticsPage() {
  const { t, locale } = useLocale();

  const reportLinks = [
    { href: "/seller/analytics/products", label: "Product Analytics" },
    { href: "/seller/analytics/revenue", label: "Revenue Analytics" },
    { href: "/seller/analytics/customers", label: "Customer Analytics" },
    { href: "/seller/analytics/inventory", label: "Inventory Analytics" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("analytics")}
        subtitle="Revenue Trend · Orders · Conversion · Best/Worst Sellers"
        breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("analytics") }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Revenue (MTD)" value={formatCurrency(sellerDashboardStats.todayRevenue * 30, locale)} icon={TrendingUp} trend="+12%" />
        <StatCard title="Orders (MTD)" value={sellerDashboardStats.todayOrders * 30} icon={ShoppingCart} />
        <StatCard title="Conversion Rate" value="3.2%" icon={Target} />
        <StatCard title="Products Sold" value={sellerDashboardStats.productsSold} icon={Package} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Best Sellers">
          {topSellingProducts.map((p) => (
            <Link key={p.id} href={`/seller/products/${p.id}`} className="mb-2 flex justify-between rounded-lg border border-sky-50 p-3 text-sm hover:bg-sky-50">
              <span>{p.name}</span>
              <span className="font-medium text-emerald-600">{p.soldCount} sold</span>
            </Link>
          ))}
        </DetailSection>

        <DetailSection title="Revenue Trend">
          <div className="flex h-40 items-center justify-center rounded-lg bg-sky-50 text-sm text-slate-500">Chart preview (mock)</div>
        </DetailSection>
      </div>

      <DetailSection title="Reports">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {reportLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-lg border border-sky-100 p-4 text-center font-medium text-sky-700 hover:bg-sky-50">
              {link.label}
            </Link>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}
