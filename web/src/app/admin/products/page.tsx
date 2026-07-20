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
import { formatCurrency } from "@/lib/utils";
import { adminBreadcrumb, categoryLabel } from "@/lib/admin-i18n";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvé",
  rejected: "Rejeté",
};

const CATEGORY_FR: Record<string, string> = {
  Electronics: "Électronique",
  Fashion: "Mode",
  "Home & Living": "Maison & Décoration",
  Beauty: "Beauté",
  Grocery: "Épicerie",
};

export default function AdminProductsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { moderationQueue } = useAdminData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(moderationQueue, filters, {
        searchFields: ["id", "name", "seller", "category"],
        dateField: "submittedDate",
        statusField: "status",
      }),
    [moderationQueue, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Modération des produits" : "Product Moderation"}
        subtitle={fr ? "Vue liste — ID produit, image, nom, vendeur, catégorie, prix, statut, date de soumission" : "List View — Product ID, Image, Name, Seller, Category, Price, Status, Submitted Date"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Modération des produits" : "Product Moderation" }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Produit, vendeur, catégorie…" : "Product, seller, category…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: fr ? "ID produit" : "Product ID" },
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
                render: (row) => (
                  <Link href={`/admin/sellers/${row.sellerId}`} className="text-[var(--primary)] hover:underline">
                    {String(row.seller)}
                  </Link>
                ),
              },
              {
                key: "category",
                label: fr ? "Catégorie" : "Category",
                render: (row) => categoryLabel(String(row.category), fr),
              },
              {
                key: "price",
                label: fr ? "Prix" : "Price",
                render: (row) => formatCurrency(row.price as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => <Badge variant="warning">{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>,
              },
              { key: "submittedDate", label: fr ? "Soumis le" : "Submitted" },
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
    </div>
  );
}
