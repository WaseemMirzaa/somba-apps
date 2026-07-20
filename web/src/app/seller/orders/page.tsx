"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData } from "@/lib/seller";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "processing", label: "Processing", labelFr: "En cours" },
  { value: "ready", label: "Ready", labelFr: "Prêt" },
  { value: "picked", label: "Picked", labelFr: "Collecté" },
  { value: "delivered", label: "Delivered", labelFr: "Livré" },
];

const ORDER_STATUS_FR: Record<string, string> = {
  pending: "En attente",
  processing: "En cours",
  ready: "Prêt",
  picked: "Collecté",
  delivered: "Livré",
  cancelled: "Annulé",
};

export default function SellerOrdersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { sellerOrderList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [orders, setOrders] = useState(() => sellerOrderList);

  useEffect(() => {
    setOrders(sellerOrderList);
  }, [sellerOrderList]);

  const filtered = useMemo(
    () =>
      applyListFilters(orders, filters, {
        // Privacy: search only on order ID and customer first name — no PII.
        searchFields: ["id", "customer"],
        dateField: "date",
        statusField: "shippingStatus",
      }),
    [orders, filters]
  );

  function acceptOrder(id: string) {
    setOrders((o) => o.map((item) => item.id === id ? { ...item, shippingStatus: "processing" } : item));
    toast(fr ? `Commande ${id} acceptée` : `Order ${id} accepted`);
  }

  function markReady(id: string) {
    setOrders((o) => o.map((item) => item.id === id ? { ...item, shippingStatus: "ready" } : item));
    toast(fr ? `Commande ${id} prête pour enlèvement` : `Order ${id} marked ready for pickup`);
  }

  return (
    <SellerListPage
      title={t("orders")}
      subtitle={fr ? "Vue liste — Numéro de commande, Client, Articles, Montant, Paiement, Statut de commande, Statut d'expédition, Date" : "List View — Order Number, Customer, Items, Amount, Payment, Order Status, Shipping Status, Date"}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("orders") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID commande, client…" : "Order ID, customer…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "Commande" : "Order", render: (row) => (
          <Link href={`/seller/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "customer", label: t("customer") },
        { key: "items", label: fr ? "Articles" : "Items" },
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "paymentMethod", label: fr ? "Paiement" : "Payment", render: (row) => formatPaymentMethod(String(row.paymentMethod), locale) },
        { key: "orderStatus", label: fr ? "Statut de commande" : "Order Status", render: (row) => <Badge variant="info">{fr ? (ORDER_STATUS_FR[String(row.orderStatus)] ?? String(row.orderStatus)) : String(row.orderStatus)}</Badge> },
        { key: "shippingStatus", label: fr ? "Expédition" : "Shipping", render: (row) => <Badge>{fr ? (ORDER_STATUS_FR[String(row.shippingStatus)] ?? String(row.shippingStatus)) : String(row.shippingStatus)}</Badge> },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/seller/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            {row.shippingStatus === "pending" && (
              <button onClick={() => acceptOrder(String(row.id))} className="text-emerald-600 hover:underline">{fr ? "Accepter" : "Accept"}</button>
            )}
            {row.shippingStatus === "processing" && (
              <button onClick={() => markReady(String(row.id))} className="text-[var(--primary)] hover:underline">{fr ? "Marquer prêt" : "Mark Ready"}</button>
            )}
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
