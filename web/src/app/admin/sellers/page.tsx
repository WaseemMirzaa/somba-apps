"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import { sellerEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function AdminSellersPage() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState("all");

  const filtered = tab === "all"
    ? sellerEntities
    : sellerEntities.filter((s) => s.status === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("sellers")}
        subtitle="List View — quick scanning only. Full info on detail page."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("sellers") },
        ]}
      />

      <div className="flex gap-2">
        {["all", "pending", "approved", "suspended"].map((tabId) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize",
              tab === tabId ? "bg-blue-600 text-white" : "border border-blue-200 text-slate-600 hover:bg-blue-50"
            )}
          >
            {tabId === "all" ? "All" : tabId === "suspended" ? "Suspended" : t(tabId as Parameters<typeof t>[0]) || tabId}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "Seller ID" },
              {
                key: "storeName",
                label: "Store Name",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="font-medium text-blue-600 hover:underline">
                    {String(row.storeName)}
                  </Link>
                ),
              },
              { key: "owner", label: "Owner" },
              { key: "phone", label: t("phone") },
              { key: "email", label: t("email") },
              { key: "city", label: "City" },
              { key: "orders", label: "Orders" },
              {
                key: "revenue",
                label: "Revenue",
                render: (row) => formatCurrency(row.revenue as number, locale),
              },
              {
                key: "healthScore",
                label: "Health",
                render: (row) => (
                  <span className={Number(row.healthScore) > 0 ? "text-emerald-600" : "text-slate-400"}>
                    {Number(row.healthScore) > 0 ? `${row.healthScore}%` : "—"}
                  </span>
                ),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={row.status === "pending" ? "warning" : row.status === "approved" ? "success" : "danger"}>
                    {row.status === "suspended" ? "Suspended" : t(row.status as Parameters<typeof t>[0]) || String(row.status)}
                  </Badge>
                ),
              },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="text-sm text-blue-600 hover:underline">
                    {t("view")}
                  </Link>
                ),
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
