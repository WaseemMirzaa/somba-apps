"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { moderationQueue } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

export default function AdminProductsPage() {
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(moderationQueue, filters, {
        searchFields: ["id", "name", "seller", "category"],
        dateField: "submittedDate",
        statusField: "status",
      }),
    [filters]
  );

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

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Product, seller, category…"
      />

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
                  <Link href={`/admin/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.name)}
                  </Link>
                ),
              },
              {
                key: "seller",
                label: "Seller",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.sellerId}`} className="text-[var(--primary)] hover:underline">
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
                  <Link href={`/admin/products/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
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
