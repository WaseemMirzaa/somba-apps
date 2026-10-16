"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useSellerData } from "@/lib/seller";
import { CASE_STATUS_OPTIONS, caseStatusLabel, caseStatusVariant } from "@/lib/seller-labels";
import { useLocale } from "@/context/locale-context";

export default function SellerDisputesPage() {
  const { sellerDisputeList } = useSellerData();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerDisputeList, filters, {
        searchFields: ["id", "orderId", "customer", "reason"],
        dateField: "date",
        statusField: "status",
      }),
    [sellerDisputeList, filters]
  );

  return (
    <div className="space-y-4">
      <SellerListPage
        title={fr ? "Litiges" : "Disputes"}
        subtitle={fr ? "Litiges clients visibles par votre compte (lecture seule)" : "Customer disputes visible to your account (read-only)"}
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: fr ? "Litiges" : "Disputes" },
        ]}
        filters={
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={CASE_STATUS_OPTIONS}
            searchPlaceholder={fr ? "ID litige, commande, client…" : "Dispute ID, order, customer…"}
          />
        }
        columns={[
          { key: "id", label: fr ? "ID litige" : "Dispute ID", render: (row) => (
            <Link href={`/seller/disputes/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
          )},
          { key: "orderId", label: fr ? "Commande" : "Order", render: (row) => (
            <Link href={`/seller/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">{String(row.orderId)}</Link>
          )},
          { key: "customer", label: fr ? "Client" : "Customer" },
          { key: "reason", label: fr ? "Motif" : "Reason", render: (row) => <span className="max-w-[16rem] text-slate-600">{String(row.reason)}</span> },
          { key: "status", label: t("status"), render: (row) => (
            <Badge variant={caseStatusVariant(String(row.status))}>{caseStatusLabel(String(row.status), fr)}</Badge>
          )},
          { key: "date", label: t("date") },
        ]}
        data={filtered as unknown as Record<string, unknown>[]}
      />
      <p className="text-xs text-slate-500">
        {fr
          ? "Il n'y a aucun litige à afficher tant que le serveur ne vous en expose pas. Les litiges sont tranchés par l'administration ; pour une commande précise, contactez le support."
          : "Nothing is shown here until the server exposes a dispute to your account. Disputes are decided by the administration; for a specific order, contact support."}
      </p>
    </div>
  );
}
