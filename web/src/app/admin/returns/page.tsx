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
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { returnEntities } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "pending_inspection", label: "Pending inspection", labelFr: "Inspection en attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  pending_inspection: "Inspection en attente",
  inspecting: "Inspection en cours",
  approved: "Approuvé",
  rejected: "Rejeté",
  refunded: "Remboursé",
};

export default function AdminReturnsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(returnEntities, filters, {
        searchFields: ["id", "orderId", "customer", "product", "reason"],
        dateField: "createdAt",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("returns")}
        subtitle={fr ? "Demandes de retour sur toute la plateforme" : "Platform-wide return requests"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("returns") }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "ID retour, commande, client…" : "Return ID, order, customer…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: fr ? "ID retour" : "Return ID", render: (row) => (
                <Link href={`/admin/returns/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                  {String(row.id)}
                </Link>
              )},
              { key: "orderId", label: fr ? "Commande" : "Order", render: (row) => (
                <Link href={`/admin/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">{String(row.orderId)}</Link>
              )},
              { key: "customer", label: t("customer") },
              { key: "product", label: fr ? "Produit" : "Product" },
              { key: "reason", label: fr ? "Motif" : "Reason", render: (row) => (
                <span className="font-medium text-amber-700">{fr ? String(row.reasonFr ?? row.reason) : String(row.reason)}</span>
              )},
              { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{fr ? (STATUS_FR[String(row.status)] ?? String(row.status).replace(/_/g, " ")) : String(row.status).replace(/_/g, " ")}</Badge> },
              { key: "refund", label: fr ? "Remboursement" : "Refund", render: (row) => {
                const refund = row.refund as { amount: number };
                return formatCurrency(refund.amount, locale);
              }},
              { key: "actions", label: t("action"), render: (row) => (
                <Link href={`/admin/returns/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
