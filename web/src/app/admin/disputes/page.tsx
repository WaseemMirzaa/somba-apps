"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useDisputes } from "@/context/dispute-context";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "seller_responded", label: "Seller responded", labelFr: "Réponse vendeur" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
  { value: "closed", label: "Closed", labelFr: "Fermé" },
];

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  open: "warning",
  seller_responded: "info",
  resolved: "success",
  closed: "default",
};

export default function AdminDisputesPage() {
  const { disputes } = useDisputes();
  const { t } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const openCount = disputes.filter((d) => d.status === "open" || d.status === "seller_responded").length;

  const filtered = useMemo(
    () =>
      applyListFilters(disputes, filters, {
        searchFields: ["id", "buyerName", "sellerName", "orderId", "productName", "reason"],
        dateField: "createdAt",
        statusField: "status",
      }),
    [disputes, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disputes Queue"
        subtitle={`${openCount} active case${openCount === 1 ? "" : "s"}`}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Disputes" }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Dispute ID, buyer, seller, order…"
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: "Dispute ID",
                render: (row) => (
                  <Link
                    href={`/admin/disputes/${row.id}`}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "orderId",
                label: "Order",
                render: (row) => (
                  <Link
                    href={`/admin/orders/${row.orderId}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {String(row.orderId)}
                  </Link>
                ),
              },
              { key: "buyerName", label: "Buyer" },
              { key: "sellerName", label: "Seller" },
              { key: "productName", label: "Product" },
              {
                key: "reason",
                label: "Reason",
                render: (row) => (
                  <span className="max-w-[10rem] text-slate-600">
                    {String(row.reason).replace(/_/g, " ")}
                  </span>
                ),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={statusVariant[row.status as string] ?? "default"}>
                    {String(row.status).replace(/_/g, " ")}
                  </Badge>
                ),
              },
              { key: "createdAt", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link
                    href={`/admin/disputes/${row.id}`}
                    className="text-sm text-[var(--primary)] hover:underline"
                  >
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
