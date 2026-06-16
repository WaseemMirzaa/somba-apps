"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getOrder } from "@/lib/entities";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useShop } from "@/context/shop-context";
import { useRouter } from "next/navigation";

export default function ShopOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const { addToCart } = useShop();
  const router = useRouter();
  const [cancelled, setCancelled] = useState(false);

  function reorder() {
    order?.items.forEach((item) => {
      addToCart({ id: item.productId, name: item.name, nameFr: item.name, price: item.price, image: item.image, seller: order.seller, variant: item.variant });
    });
    toast("Items added to cart");
    router.push("/shop/cart");
  }
  const order = getOrder(id);

  if (!order) {
    return <div className="text-center text-slate-500">Order not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`Placed ${order.date} · ${cancelled ? "cancelled" : order.status}`}
        backHref="/shop/orders"
        actions={
          order.status === "delivered" ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={reorder} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">Reorder</button>
              <Link href={`/shop/orders/${id}/return`} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium shadow-sm hover:border-blue-200">Return</Link>
              <Link href={`/shop/products/${order.items[0]?.productId}/reviews`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">Review</Link>
            </div>
          ) : order.status !== "cancelled" && !cancelled ? (
            <button onClick={() => { setCancelled(true); toast("Order cancelled"); }} className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600">Cancel</button>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title="Order">
          <InfoGrid items={[
            { label: "Order ID", value: order.id },
            { label: "Date", value: order.date },
            { label: "Status", value: cancelled ? "cancelled" : order.status },
            { label: "Total", value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Delivery Address">
          <InfoGrid items={[
            { label: "Name", value: order.customer },
            { label: "Phone", value: order.customerPhone },
            { label: "Address", value: order.customerAddress, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Payment">
          <InfoGrid items={[
            { label: "Method", value: formatPaymentMethod(order.paymentMethod, locale) },
            { label: "Transaction", value: order.transactionId },
            { label: "Status", value: order.paymentStatus },
            { label: "Amount", value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Products" span={3}>
          {order.items.map((item) => (
            <div key={item.sku} className="mb-4 flex gap-4 last:mb-0">
              <Link href={`/shop/products/${item.productId}`} className="relative h-16 w-16 overflow-hidden rounded-lg">
                <Image src={item.image} alt={item.name} fill className="object-cover" sizes="64px" />
              </Link>
              <div className="flex-1">
                <Link href={`/shop/products/${item.productId}`} className="font-medium hover:text-[var(--primary)]">{item.name}</Link>
                <p className="text-xs text-slate-500">{item.variant} · SKU: {item.sku}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatCurrency(item.price, locale)}</p>
                <p className="text-xs">Qty: {item.qty}</p>
              </div>
            </div>
          ))}
        </DetailGridSection>

        <DetailGridSection title="Order Tracking" span={2}>
          <p className="mb-4 text-sm text-slate-500">Tracking: {order.trackingNumber} · Rider: {order.rider}</p>
          <Link href={`/shop/orders/${id}/tracking`} className="mb-4 inline-block text-sm text-[var(--primary)] hover:underline">Live map tracking →</Link>
          <ActivityTimeline events={order.timeline} />
        </DetailGridSection>

        <DetailGridSection title="Support">
          <p className="text-sm text-slate-500">Need help with this order?</p>
          <Link href={`/shop/support?order=${order.id}`} className="btn-primary mt-3 inline-block px-4 py-2 text-sm">Open Support Ticket</Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
