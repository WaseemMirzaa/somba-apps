"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { shipmentList } from "@/lib/seller-entities";

export default function SellerShippingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <SellerListPage
      title={t("shipping")}
      subtitle={fr ? "N° expédition, commande, livreur, entrepôt, statut, heure de retrait" : "Shipment ID, Order, Rider, Warehouse, Status, Pickup Time"}
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("shipping") }]}
      columns={[
        { key: "id", label: fr ? "N° expédition" : "Shipment ID", render: (row) => (
          <Link href={`/seller/shipping/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "Commande" : "Order", render: (row) => (
          <Link href={`/seller/orders/${row.orderId}`} className="text-sky-600 hover:underline">{String(row.orderId)}</Link>
        )},
        { key: "rider", label: fr ? "Livreur" : "Rider" },
        { key: "warehouse", label: fr ? "Entrepôt" : "Warehouse" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
        { key: "pickupTime", label: fr ? "Heure de retrait" : "Pickup Time" },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/shipping/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={shipmentList as unknown as Record<string, unknown>[]}
    />
  );
}
