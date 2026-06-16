"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useDisputes } from "@/context/dispute-context";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "seller_responded", label: "Seller responded", labelFr: "Réponse vendeur" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
  { value: "closed", label: "Closed", labelFr: "Fermé" },
];

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  open: "warning",
  seller_responded: "info",
  resolved: "success",
  closed: "default",
};

const STATUS_FR: Record<string, string> = {
  open: "Ouvert",
  seller_responded: "Réponse vendeur",
  resolved: "Résolu",
  closed: "Fermé",
};

const REASON_FR: Record<string, string> = {
  not_as_described: "Non conforme à la description",
  defective: "Défectueux",
  damaged: "Endommagé",
  wrong_item: "Mauvais article",
  not_received: "Non reçu",
  late_delivery: "Livraison en retard",
};

export default function AdminDisputesPage() {
  const { disputes } = useDisputes();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const openCount = disputes.filter((d) => d.status === "open" || d.status === "seller_responded").length;

  const filtered = useMemo(
    () =>
      applyListFilters(disputes, filters, {
        searchFields: ["id", "buyerName", "sellerName", "orderId", "productName", "reason"],
        dateField: "createdAt",
        statusField: "status",
      }),
    [disputes, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "File des litiges" : "Disputes Queue"}
        subtitle={fr ? `${openCount} dossier${openCount === 1 ? "" : "s"} actif${openCount === 1 ? "" : "s"}` : `${openCount} active case${openCount === 1 ? "" : "s"}`}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Litiges" : "Disputes" }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "ID litige, acheteur, vendeur, commande…" : "Dispute ID, buyer, seller, order…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: fr ? "ID litige" : "Dispute ID",
                render: (row) => (
                  <Link
                    href={`/admin/disputes/${row.id}`}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "orderId",
                label: fr ? "Commande" : "Order",
                render: (row) => (
                  <Link
                    href={`/admin/orders/${row.orderId}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {String(row.orderId)}
                  </Link>
                ),
              },
              { key: "buyerName", label: fr ? "Acheteur" : "Buyer" },
              { key: "sellerName", label: fr ? "Vendeur" : "Seller" },
              { key: "productName", label: fr ? "Produit" : "Product" },
              {
                key: "reason",
                label: fr ? "Motif" : "Reason",
                render: (row) => (
                  <span className="max-w-[10rem] text-slate-600">
                    {fr ? (REASON_FR[String(row.reason)] ?? String(row.reason).replace(/_/g, " ")) : String(row.reason).replace(/_/g, " ")}
                  </span>
                ),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={statusVariant[row.status as string] ?? "default"}>
                    {fr ? (STATUS_FR[String(row.status)] ?? String(row.status).replace(/_/g, " ")) : String(row.status).replace(/_/g, " ")}
                  </Badge>
                ),
              },
              { key: "createdAt", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link
                    href={`/admin/disputes/${row.id}`}
                    className="text-sm text-[var(--primary)] hover:underline"
                  >
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
