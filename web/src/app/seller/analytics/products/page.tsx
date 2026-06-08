"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { topSellingProducts } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerProductAnalyticsPage() {
  const { locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader title="Product Analytics" backHref="/seller/analytics" />
      <div className="space-y-3">
        {topSellingProducts.map((p) => (
          <Link key={p.id} href={`/seller/products/${p.id}`} className="flex justify-between rounded-xl border border-sky-100 bg-white p-4 hover:shadow-sm">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-slate-500">{p.views} views · {p.orders} orders</p>
            </div>
            <span className="font-bold text-sky-700">{formatCurrency(p.revenue, locale)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
