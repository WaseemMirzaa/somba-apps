"use client";

import { localDay } from "@/lib/dates";
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
import { useRealtime } from "@/context/realtime-context";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABEL, orderStatusLabel, useFeedState } from "@/lib/admin-live";
import { orderSellers, sellerSummary, type SellerRef } from "@/lib/order-packages";
import { PAYMENT_METHOD_IDS, paymentMethodLabel } from "@/lib/payment-methods";

const STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABEL).map(([value, l]) => ({ value, label: l.en, labelFr: l.fr }));

export default function AdminOrdersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const feed = useFeedState();
  const orderEntities = useMemo(() => {
    const owner = new Map(rt.products.map((p) => [p.id, p]));
    return rt.orders.map((o) => {
      // Sellers come from the line snapshots taken at order time; older orders
      // without a snapshot fall back to the product's current owner.
      const sellers: SellerRef[] = orderSellers(
        o.items.map((it) => {
          if (it.sellerId || it.sellerName) return it;
          const p = owner.get(it.productId);
          return { sellerId: p?.sellerId ?? null, sellerName: p?.sellerName ?? null };
        }),
      );
      return {
        id: o.reference,
        customerId: o.customerId,
        customer: o.customerName,
        sellers,
        sellerId: sellers[0]?.id ?? null,
        seller: sellerSummary(sellers, fr),
        // Search text: every seller on the order, not just the first.
        sellerSearch: sellers.map((x) => `${x.name} ${x.id ?? ""}`).join(" "),
        amount: o.totalUsd,
        paymentMethod: o.paymentMethod,
        status: o.status,
        date: localDay(o.createdAt),
      };
    });
  }, [rt.orders, rt.products, fr]);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [methodFilter, setMethodFilter] = useState("");

  const filtered = useMemo(
    () =>
      applyListFilters(orderEntities, filters, {
        searchFields: ["id", "customer", "sellerSearch", "customerId"],
        dateField: "date",
        statusField: "status",
      }).filter((o) => !methodFilter || o.paymentMethod === methodFilter),
    [orderEntities, filters, methodFilter]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("orders")}
        subtitle={fr ? `${rt.orders.length} commandes (en direct)` : `${rt.orders.length} orders (live)`}
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <label htmlFor="orders-payment-filter" className="text-xs font-medium text-slate-600">
          {fr ? "Mode de paiement" : "Payment method"}
        </label>
        <select
          id="orders-payment-filter"
          className="input-premium px-3 py-2 text-sm"
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
        >
          <option value="">{fr ? "Tous les modes" : "All methods"}</option>
          {PAYMENT_METHOD_IDS.map((value) => (
            <option key={value} value={value}>{paymentMethodLabel(value, fr)}</option>
          ))}
        </select>
      </div>

      {feed.error && <SectionError message={feed.error} />}
      {feed.loading && <SectionLoading />}

      {!feed.loading && !feed.error && (
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucune commande" : "No orders yet"}
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
                render: (row) => {
                  const sellers = row.sellers as SellerRef[];
                  if (sellers.length === 1 && sellers[0].id) {
                    return (
                      <Link href={`/admin/sellers/${sellers[0].id}`} className="text-[var(--primary)] hover:underline">
                        {String(row.seller)}
                      </Link>
                    );
                  }
                  return (
                    <span title={sellers.map((x) => x.name).join(", ")}>
                      {String(row.seller)}
                    </span>
                  );
                },
              },
              {
                key: "amount",
                label: t("amount"),
                render: (row) => formatCurrency(row.amount as number, locale),
              },
              {
                key: "paymentMethod",
                label: fr ? "Paiement" : "Payment",
                render: (row) => paymentMethodLabel(String(row.paymentMethod), fr),
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
      )}
    </div>
  );
}
