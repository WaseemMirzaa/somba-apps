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
  PACKAGE_STATUS_OPTIONS,
  packageStatusLabel,
  packageStatusVariant,
  paymentMethodLabel,
} from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

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
        statusField: "packageStatus",
      }),
    [sellerOrderList, filters]
  );

  return (
    <SellerListPage
      title={t("orders")}
      subtitle={fr ? "Commandes contenant vos produits. Marquez « colis prêt » depuis le détail de la commande. Sur une commande partagée, vous ne voyez et ne préparez que vos articles." : "Orders containing your products. Mark “package ready” from the order detail. On a shared order you only see and pack your own items."}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("orders") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={PACKAGE_STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID commande, client…" : "Order ID, customer…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "Commande" : "Order", render: (row) => (
          <div>
            <Link href={`/seller/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
            {(row.sellerCount as number) > 1 && (
              <p className="text-xs text-slate-500">
                {fr ? `Commande partagée · ${row.sellerCount} vendeurs` : `Shared order · ${row.sellerCount} sellers`}
              </p>
            )}
          </div>
        )},
        { key: "customer", label: t("customer") },
        { key: "items", label: fr ? "Articles" : "Items" },
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "paymentMethod", label: fr ? "Paiement" : "Payment", render: (row) => paymentMethodLabel(String(row.paymentMethod), fr) },
        { key: "packageStatus", label: t("status"), render: (row) => <Badge variant={packageStatusVariant(String(row.packageStatus))}>{packageStatusLabel(String(row.packageStatus), fr)}</Badge> },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/orders/${row.id}`} className="text-xs text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
      emptyMessage={fr ? "Aucune commande pour le moment. Elles apparaissent ici dès qu'un client commande un de vos produits." : "No orders yet. They appear here as soon as a customer orders one of your products."}
    />
  );
}
