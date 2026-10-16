"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import {
  ORDER_STATUS_OPTIONS,
  orderStatusLabel,
  orderStatusVariant,
  shippingStatusLabel,
  shippingStatusVariant,
} from "@/lib/seller-labels";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  stripe_card: "Card",
  airtel_money: "Mobile Money",
  wallet: "Wallet",
};

export default function SellerOrdersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerOrderList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerOrderList, filters, {
        // Privacy: search only on order ID and customer first name — no PII.
        searchFields: ["id", "customer"],
        dateField: "date",
        statusField: "orderStatus",
      }),
    [sellerOrderList, filters]
  );

  return (
    <SellerListPage
      title={t("orders")}
      subtitle={fr ? "Commandes contenant vos produits. Marquez « colis prêt » depuis le détail de la commande." : "Orders containing your products. Mark “package ready” from the order detail."}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("orders") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={ORDER_STATUS_OPTIONS}
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
        { key: "paymentMethod", label: fr ? "Paiement" : "Payment", render: (row) => formatPaymentMethod(PAYMENT_LABEL[String(row.paymentMethod)] ?? String(row.paymentMethod), locale) },
        { key: "orderStatus", label: fr ? "Statut de commande" : "Order Status", render: (row) => <Badge variant={orderStatusVariant(String(row.orderStatus))}>{orderStatusLabel(String(row.orderStatus), fr)}</Badge> },
        { key: "shippingStatus", label: fr ? "Expédition" : "Shipping", render: (row) => <Badge variant={shippingStatusVariant(String(row.shippingStatus))}>{shippingStatusLabel(String(row.shippingStatus), fr)}</Badge> },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/orders/${row.id}`} className="text-xs text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
