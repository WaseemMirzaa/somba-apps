"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useAdminData } from "@/lib/admin";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { formatCurrency } from "@/lib/utils";
import { adminBreadcrumb } from "@/lib/admin-i18n";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "live", label: "Live", labelFr: "En ligne" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
  { value: "removed", label: "Blocked", labelFr: "Bloqué" },
  { value: "draft", label: "Draft (paused)", labelFr: "Brouillon (en pause)" },
];

const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  live: "En ligne",
  rejected: "Rejeté",
  removed: "Bloqué",
  draft: "Brouillon",
};

export default function AdminProductsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { moderationQueue, loading, error } = useAdminData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(moderationQueue, filters, {
        // Both languages of the title and the category, whatever language the admin reads the portal in.
        searchFields: ["id", "name", "seller", "category", (r) => r.raw.name, (r) => r.raw.nameFr ?? "", (r) => r.raw.categoryFr ?? ""],
        statusField: "status",
      }),
    [moderationQueue, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Modération des produits" : "Product Moderation"}
        subtitle={fr ? "Produits en direct — approuver, rejeter, bloquer" : "Live products — approve, reject, block"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Modération des produits" : "Product Moderation" }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Produit, vendeur, catégorie…" : "Product, seller, category…"}
      />

      {error && <SectionError message={error} />}
      {loading && !error && <SectionLoading />}

      {!loading && !error && (
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun produit" : "No products"}
            columns={[
              { key: "id", label: fr ? "ID produit" : "Product ID", render: (row) => <span className="font-mono text-xs">{String(row.id).slice(0, 8)}</span> },
              {
                key: "image",
                label: fr ? "Image" : "Image",
                render: (row) => (
                  <div className="relative h-10 w-10 overflow-hidden rounded">
                    <Image src={String(row.image)} alt="" fill className="object-cover" sizes="40px" />
                  </div>
                ),
              },
              {
                key: "name",
                label: fr ? "Nom" : "Name",
                primary: true,
                render: (row) => (
                  <Link href={`/admin/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.name)}
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
                key: "category",
                label: fr ? "Catégorie" : "Category",
                render: (row) => String(row.category),
              },
              {
                key: "price",
                label: fr ? "Prix" : "Price",
                render: (row) => formatCurrency(row.price as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => <Badge variant={row.status === "live" ? "success" : row.status === "pending" ? "warning" : row.status === "draft" ? "default" : "danger"}>{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>,
              },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/admin/products/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
                    {fr ? "Examiner" : "Review"}
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
