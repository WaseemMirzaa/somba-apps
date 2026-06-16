"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerOrderList as initialOrders } from "@/lib/seller-entities";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "processing", label: "Processing", labelFr: "En cours" },
  { value: "ready", label: "Ready", labelFr: "Prêt" },
  { value: "picked", label: "Picked", labelFr: "Collecté" },
  { value: "delivered", label: "Delivered", labelFr: "Livré" },
];

export default function SellerOrdersPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [orders, setOrders] = useState(initialOrders);

  const filtered = useMemo(
    () =>
      applyListFilters(orders, filters, {
        searchFields: ["id", "customer", "paymentMethod"],
        dateField: "date",
        statusField: "shippingStatus",
      }),
    [orders, filters]
  );

  function acceptOrder(id: string) {
    setOrders((o) => o.map((item) => item.id === id ? { ...item, shippingStatus: "processing" } : item));
    toast(`Order ${id} accepted`);
  }

  function markReady(id: string) {
    setOrders((o) => o.map((item) => item.id === id ? { ...item, shippingStatus: "ready" } : item));
    toast(`Order ${id} marked ready for pickup`);
  }

  return (
    <SellerListPage
      title={t("orders")}
      subtitle="List View — Order Number, Customer, Items, Amount, Payment, Order Status, Shipping Status, Date"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("orders") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Order ID, customer…"
        />
      }
      columns={[
        { key: "id", label: "Order", render: (row) => (
          <Link href={`/seller/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "customer", label: "Customer" },
        { key: "items", label: "Items" },
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "paymentMethod", label: "Payment", render: (row) => formatPaymentMethod(String(row.paymentMethod), locale) },
        { key: "orderStatus", label: "Order Status", render: (row) => <Badge variant="info">{String(row.orderStatus)}</Badge> },
        { key: "shippingStatus", label: "Shipping", render: (row) => <Badge>{String(row.shippingStatus)}</Badge> },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/seller/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            {row.shippingStatus === "pending" && (
              <button onClick={() => acceptOrder(String(row.id))} className="text-emerald-600 hover:underline">Accept</button>
            )}
            {row.shippingStatus === "processing" && (
              <button onClick={() => markReady(String(row.id))} className="text-[var(--primary)] hover:underline">Mark Ready</button>
            )}
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
