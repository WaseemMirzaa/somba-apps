"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getOrder, resolveAdminWarehouseHref } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { mapTimelineEvents, statusLabel } from "@/lib/locale-helpers";

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const order = getOrder(id);

  if (!order) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${order.date} · ${statusLabel(locale, order.status)} · ${formatCurrency(order.amount, locale)}`}
        backHref="/admin/orders"
        breadcrumbs={[
          { label: t("adminBreadcrumb"), href: "/admin" },
          { label: t("orders"), href: "/admin/orders" },
          { label: order.id },
        ]}
        actions={<Badge variant="info">{statusLabel(locale, order.status)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={t("orderSection")}>
          <InfoGrid items={[
            { label: t("orderId"), value: order.id },
            { label: t("date"), value: order.date },
            { label: t("status"), value: statusLabel(locale, order.status) },
            { label: t("items"), value: order.itemsCount },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customerSection")}>
          <InfoGrid items={[
            { label: t("name"), value: <Link href={`/admin/customers/${order.customerId}`} className="text-blue-600 hover:underline">{order.customer}</Link> },
            { label: t("phone"), value: order.customerPhone },
            { label: t("address"), value: order.customerAddress, full: true },
            { label: t("city"), value: order.customerCity },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("sellerSection")}>
          <InfoGrid items={[
            { label: t("store"), value: <Link href={`/admin/sellers/${order.sellerId}`} className="text-blue-600 hover:underline">{order.seller}</Link> },
            { label: t("sellerId"), value: order.sellerId },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("paymentSection")}>
          <InfoGrid items={[
            { label: t("gateway"), value: order.paymentMethod === "COD" ? t("cashOnDelivery") : t("stripeGateway") },
            { label: t("reference"), value: order.transactionId },
            { label: t("status"), value: statusLabel(locale, order.paymentStatus) },
            { label: t("amount"), value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("logistics")}>
          <InfoGrid items={[
            { label: t("warehouses"), value: <Link href={resolveAdminWarehouseHref(order.warehouseId)} className="text-blue-600 hover:underline">{order.warehouse}</Link> },
            { label: t("rider"), value: order.rider },
            { label: t("trackingNumber"), value: order.trackingNumber },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("financial")}>
          <InfoGrid columns={3} items={[
            { label: t("orderAmount"), value: formatCurrency(order.amount, locale) },
            { label: t("commissionLabel"), value: formatCurrency(order.commission, locale) },
            { label: t("sellerEarnings"), value: formatCurrency(order.sellerEarnings, locale) },
            { label: t("refundLabel"), value: formatCurrency(order.refunds, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("productDetails")} span={3}>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div key={item.sku} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="64px" />
                </div>
                <div className="flex-1">
                  <Link href={`/shop/products/${item.productId}`} className="font-medium text-blue-600 hover:underline">{item.name}</Link>
                  <p className="text-xs text-slate-500">{t("sku")}: {item.sku} · {item.variant}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(item.price, locale)}</p>
                  <p className="text-xs text-slate-500">{t("items")}: {item.qty}</p>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={t("activityTimeline")} span={3}>
          <ActivityTimeline events={mapTimelineEvents(locale, order.timeline)} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
