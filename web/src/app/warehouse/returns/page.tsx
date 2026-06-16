"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { returnEntities as initialReturns } from "@/lib/warehouse-entities";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "pending_inspection", label: "Pending inspection", labelFr: "Inspection en attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

export default function WarehouseReturnsPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [returns, setReturns] = useState(initialReturns);

  const filtered = useMemo(
    () =>
      applyListFilters(returns, filters, {
        searchFields: ["id", "orderId", "customer", "reason"],
        dateField: "createdAt",
        statusField: "status",
      }),
    [returns, filters]
  );

  function updateStatus(id: string, status: string) {
    setReturns((r) => r.map((item) => (item.id === id ? { ...item, status } : item)));
    toast(`Return ${id} ${status}`);
  }

  return (
    <WarehouseListPage
      title={t("returns")}
      subtitle="List View — Return ID, Order ID, Customer, Reason, Status"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("returns") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Return ID, order, customer…"
        />
      }
      columns={[
        { key: "id", label: "Return ID", render: (row) => (
          <Link href={`/warehouse/returns/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order ID" },
        { key: "customer", label: "Customer" },
        { key: "reason", label: "Reason" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(row.status).replace("_", " ")}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/warehouse/returns/${row.id}`} className="text-[var(--primary)] hover:underline">Inspect</Link>
            {(row.status === "pending" || row.status === "pending_inspection") && (
              <>
                <button onClick={() => updateStatus(String(row.id), "approved")} className="text-emerald-600 hover:underline">Approve</button>
                <button onClick={() => updateStatus(String(row.id), "rejected")} className="text-red-600 hover:underline">Reject</button>
              </>
            )}
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
