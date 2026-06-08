"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { shipmentList } from "@/lib/seller-entities";

export default function SellerShippingPage() {
  const { t } = useLocale();

  return (
    <SellerListPage
      title={t("shipping")}
      subtitle="List View — Shipment ID, Order, Rider, Warehouse, Status, Pickup Time"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("shipping") }]}
      columns={[
        { key: "id", label: "Shipment ID", render: (row) => (
          <Link href={`/seller/shipping/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order", render: (row) => (
          <Link href={`/seller/orders/${row.orderId}`} className="text-sky-600 hover:underline">{String(row.orderId)}</Link>
        )},
        { key: "rider", label: "Rider" },
        { key: "warehouse", label: "Warehouse" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
        { key: "pickupTime", label: "Pickup Time" },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/shipping/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={shipmentList as unknown as Record<string, unknown>[]}
    />
  );
}
