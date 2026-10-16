"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useAdminData } from "@/lib/admin";
import { formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABEL, orderStatusLabel } from "@/lib/admin-live";

const STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABEL).map(([value, l]) => ({ value, label: l.en, labelFr: l.fr }));

const PAYMENT_METHOD_FR: Record<string, string> = {
  Card: "Carte",
};

export default function AdminOrdersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { orderEntities } = useAdminData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(orderEntities, filters, {
        searchFields: ["id", "customer", "seller", "customerId", "sellerId"],
        dateField: "date",
        statusField: "status",
      }),
    [orderEntities, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("orders")}
        subtitle={fr ? "Vue liste — ID commande, client, vendeur, montant, paiement, statut, date" : "List View — Order ID, Customer, Seller, Amount, Payment, Status, Date"}
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: t("orders") },
        ]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "ID commande, client, vendeur…" : "Order ID, customer, seller…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: fr ? "ID commande" : "Order ID",
                render: (row) => (
                  <Link href={`/admin/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "customer",
                label: t("customer"),
                render: (row) => (
                  <Link href={`/admin/customers/${row.customerId}`} className="text-[var(--primary)] hover:underline">
                    {String(row.customer)}
                  </Link>
                ),
              },
              {
                key: "seller",
                label: fr ? "Vendeur" : "Seller",
                render: (row) =>
                  row.sellerId ? (
                    <Link href={`/admin/sellers/${row.sellerId}`} className="text-[var(--primary)] hover:underline">
                      {String(row.seller)}
                    </Link>
                  ) : (
                    <span>{String(row.seller)}</span>
                  ),
              },
              {
                key: "amount",
                label: t("amount"),
                render: (row) => formatCurrency(row.amount as number, locale),
              },
              {
                key: "paymentMethod",
                label: fr ? "Paiement" : "Payment",
                render: (row) => (fr ? (PAYMENT_METHOD_FR[String(row.paymentMethod)] ?? String(row.paymentMethod)) : String(row.paymentMethod)),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={ORDER_STATUS_BADGE[row.status as string] ?? "default"}>
                    {orderStatusLabel(String(row.status), fr)}
                  </Badge>
                ),
              },
              { key: "date", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/admin/orders/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
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
