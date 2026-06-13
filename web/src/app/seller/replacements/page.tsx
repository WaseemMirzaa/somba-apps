"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { sellerReplacementList } from "@/lib/seller-entities";

export default function SellerReplacementsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <SellerListPage
      title={t("replacements")}
      subtitle={fr ? "N° dossier, commande, client, SKU, statut" : "Replacement ID, Order, Customer, SKU, Status"}
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("replacements") }]}
      columns={[
        { key: "id", label: fr ? "N° dossier" : "Case ID", render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "Commande" : "Order" },
        { key: "customer", label: fr ? "Client" : "Customer" },
        { key: "sku", label: "SKU" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={sellerReplacementList as unknown as Record<string, unknown>[]}
    />
  );
}
