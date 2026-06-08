"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import { moderationQueue } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function AdminProductsPage() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState("pending");

  const counts = {
    pending: moderationQueue.filter((p) => p.status === "pending").length,
    approved: moderationQueue.filter((p) => p.status === "approved").length,
    rejected: moderationQueue.filter((p) => p.status === "rejected").length,
  };

  const filtered = tab === "all"
    ? moderationQueue
    : moderationQueue.filter((p) => p.status === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Moderation"
        subtitle="List View — Product ID, Image, Name, Seller, Category, Price, Status, Submitted Date"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Product Moderation" },
        ]}
      />

      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((tabId) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize",
              tab === tabId ? "bg-blue-600 text-white" : "border border-blue-200 text-slate-600 hover:bg-blue-50"
            )}
          >
            {tabId} ({counts[tabId]})
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "Product ID" },
              {
                key: "image",
                label: "Image",
                render: (row) => (
                  <div className="relative h-10 w-10 overflow-hidden rounded">
                    <Image src={String(row.image)} alt="" fill className="object-cover" sizes="40px" />
                  </div>
                ),
              },
              {
                key: "name",
                label: "Name",
                render: (row) => (
                  <Link href={`/admin/products/${row.id}`} className="font-medium text-blue-600 hover:underline">
                    {String(row.name)}
                  </Link>
                ),
              },
              {
                key: "seller",
                label: "Seller",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.sellerId}`} className="text-blue-600 hover:underline">
                    {String(row.seller)}
                  </Link>
                ),
              },
              { key: "category", label: "Category" },
              {
                key: "price",
                label: "Price",
                render: (row) => formatCurrency(row.price as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => <Badge variant="warning">{String(row.status)}</Badge>,
              },
              { key: "submittedDate", label: "Submitted" },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/admin/products/${row.id}`} className="text-sm text-blue-600 hover:underline">
                    Review
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
