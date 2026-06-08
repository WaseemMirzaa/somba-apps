"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getOrder } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const order = getOrder(id);

  if (!order) {
    return <div className="p-8 text-center text-slate-500">Order not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${order.date} · ${order.status} · ${formatCurrency(order.amount, locale)}`}
        backHref="/admin/orders"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("orders"), href: "/admin/orders" },
          { label: order.id },
        ]}
        actions={<Badge variant="info">{order.status}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title="Order">
          <InfoGrid items={[
            { label: "Order ID", value: order.id },
            { label: "Date", value: order.date },
            { label: "Status", value: order.status },
            { label: "Items", value: order.itemsCount },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Customer">
          <InfoGrid items={[
            { label: "Name", value: <Link href={`/admin/customers/${order.customerId}`} className="text-blue-600 hover:underline">{order.customer}</Link> },
            { label: "Phone", value: order.customerPhone },
            { label: "Address", value: order.customerAddress, full: true },
            { label: "City", value: order.customerCity },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Seller">
          <InfoGrid items={[
            { label: "Store", value: <Link href={`/admin/sellers/${order.sellerId}`} className="text-blue-600 hover:underline">{order.seller}</Link> },
            { label: "Seller ID", value: order.sellerId },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Payment">
          <InfoGrid items={[
            { label: "Gateway", value: order.paymentMethod === "COD" ? "Cash on Delivery" : "Stripe" },
            { label: "Transaction ID", value: order.transactionId },
            { label: "Status", value: order.paymentStatus },
            { label: "Amount", value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Logistics">
          <InfoGrid items={[
            { label: "Warehouse", value: <Link href="/warehouse" className="text-blue-600 hover:underline">{order.warehouse}</Link> },
            { label: "Rider", value: order.rider },
            { label: "Tracking Number", value: order.trackingNumber },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Financial">
          <InfoGrid columns={3} items={[
            { label: "Order Amount", value: formatCurrency(order.amount, locale) },
            { label: "Commission", value: formatCurrency(order.commission, locale) },
            { label: "Seller Earnings", value: formatCurrency(order.sellerEarnings, locale) },
            { label: "Refunds", value: formatCurrency(order.refunds, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Product Details" span={3}>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div key={item.sku} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="64px" />
                </div>
                <div className="flex-1">
                  <Link href={`/shop/products/${item.productId}`} className="font-medium text-blue-600 hover:underline">{item.name}</Link>
                  <p className="text-xs text-slate-500">SKU: {item.sku} · Variant: {item.variant}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(item.price, locale)}</p>
                  <p className="text-xs text-slate-500">Qty: {item.qty}</p>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title="Activity Timeline" span={3}>
          <ActivityTimeline events={order.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
