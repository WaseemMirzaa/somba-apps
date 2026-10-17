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
import { useRealtime } from "@/context/realtime-context";
import { useServerList } from "@/lib/admin-live";
import { rankSellers } from "@/lib/admin-stats";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import type { Seller } from "@/lib/realtime/types";
import { formatCurrency } from "@/lib/utils";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { SellerStatusActions } from "@/components/admin/status-actions";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "suspended", label: "Suspended", labelFr: "Suspendu" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

const SELLER_STATUS_FR: Record<string, string> = { pending: "En attente", approved: "Approuvé", suspended: "Suspendu", rejected: "Rejeté" };

export default function AdminSellersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const sellers = useServerList<Seller & { plan?: string }>("sellers:list", { pushEvents: ["seller:updated"] });
  const sellerEntities = useMemo(
    () => rankSellers(rt.orders, rt.products, sellers.items).map((s) => ({ ...s, storeName: s.name, date: s.createdAt.slice(0, 10), orders: s.orderCount })),
    [rt.orders, rt.products, sellers.items],
  );
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerEntities, filters, {
        searchFields: ["storeName", "id"],
        dateField: "date",
        statusField: "status",
      }),
    [sellerEntities, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("sellers")}
        subtitle={fr ? "Boutiques enregistrées ; le détail est sur la page de chaque vendeur" : "Registered stores; full figures are on each seller's page"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("sellers") }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Boutique, identifiant…" : "Store, id…"}
      />

      {sellers.error && <SectionError message={sellers.error} onRetry={sellers.reload} />}
      {sellers.loading && !sellers.error && <SectionLoading />}

      {!sellers.loading && !sellers.error && (
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun vendeur" : "No sellers yet"}
            columns={[
              {
                key: "storeName",
                label: fr ? "Boutique" : "Store",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.storeName)}
                  </Link>
                ),
              },
              { key: "productCount", label: fr ? "Produits" : "Products" },
              { key: "plan", label: fr ? "Formule" : "Plan", render: (row) => String(row.plan ?? "free") },
              {
                key: "orders",
                label: fr ? "Commandes" : "Orders",
                render: (row) => Number(row.orders).toLocaleString(),
              },
              {
                key: "revenue",
                label: fr ? "Chiffre d'affaires" : "Revenue",
                render: (row) => formatCurrency(row.revenue as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={row.status === "approved" ? "success" : row.status === "pending" ? "warning" : "danger"}>
                    {fr ? (SELLER_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}
                  </Badge>
                ),
              },
              { key: "date", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/admin/sellers/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
                      {t("view")}
                    </Link>
                    <SellerStatusActions sellerId={String(row.id)} status={String(row.status)} name={String(row.storeName)} />
                  </div>
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
