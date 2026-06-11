"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getOrder } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useShop } from "@/context/shop-context";
import { mapTimelineEvents, statusLabel } from "@/lib/locale-helpers";

export default function ShopOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const { toast } = useToast();
  const { addToCart } = useShop();
  const router = useRouter();
  const [cancelled, setCancelled] = useState(false);
  const order = getOrder(id);

  function reorder() {
    order?.items.forEach((item) => {
      addToCart({ id: item.productId, name: item.name, nameFr: item.name, price: item.price, image: item.image, seller: order!.seller, variant: item.variant });
    });
    toast(locale === "fr" ? "Articles ajoutés au panier" : "Items added to cart");
    router.push("/shop/cart");
  }

  if (!order) {
    return <div className="text-center text-slate-500">{t("notFound")}</div>;
  }

  const displayStatus = cancelled ? "cancelled" : order.status;
  const timelineEvents = mapTimelineEvents(locale, order.timeline);

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${t("placedOn")} ${order.date} · ${statusLabel(locale, displayStatus)}`}
        backHref="/shop/orders"
        actions={
          order.status === "delivered" ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={reorder} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">{t("reorder")}</button>
              <Link href={`/shop/orders/${id}/return`} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium shadow-sm hover:border-blue-200">{t("returnLink")}</Link>
              <Link href={`/shop/products/${order.items[0]?.productId}/reviews`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">{t("review")}</Link>
            </div>
          ) : order.status !== "cancelled" && !cancelled ? (
            <button onClick={() => { setCancelled(true); toast(locale === "fr" ? "Commande annulée" : "Order cancelled"); }} className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600">{t("cancel")}</button>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title={t("order")}>
          <InfoGrid items={[
            { label: t("orderId"), value: order.id },
            { label: t("date"), value: order.date },
            { label: t("status"), value: statusLabel(locale, displayStatus) },
            { label: t("amount"), value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("deliveryAddress")}>
          <InfoGrid items={[
            { label: t("name"), value: order.customer },
            { label: t("phone"), value: order.customerPhone },
            { label: t("address"), value: order.customerAddress, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("payment")}>
          <InfoGrid items={[
            { label: t("method"), value: order.paymentMethod },
            { label: t("transaction"), value: order.transactionId },
            { label: t("status"), value: statusLabel(locale, order.paymentStatus) },
            { label: t("amount"), value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        {order.fulfilmentGroups && order.fulfilmentGroups.length > 0 && (
          <DetailGridSection title={t("fulfilmentBySeller")} span={3}>
            {order.fulfilmentGroups.map((group) => (
              <div key={group.parcelId} className="mb-4 rounded-xl border border-blue-100 bg-blue-50/30 p-4 last:mb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{group.seller}</p>
                    <p className="text-xs text-slate-500">{group.parcelId} · {group.trackingNumber} · {statusLabel(locale, group.status)}</p>
                  </div>
                  <Link href={`/shop/orders/${id}/tracking`} className="text-xs text-blue-600 hover:underline">{t("trackParcel")}</Link>
                </div>
                {group.items.map((item) => (
                  <p key={item.sku} className="mt-2 text-sm text-slate-600">{item.name} × {item.qty}</p>
                ))}
              </div>
            ))}
          </DetailGridSection>
        )}

        <DetailGridSection title={t("products")} span={3}>
          {order.items.map((item) => (
            <div key={item.sku} className="mb-4 flex gap-4 last:mb-0">
              <Link href={`/shop/products/${item.productId}`} className="relative h-16 w-16 overflow-hidden rounded-lg">
                <Image src={item.image} alt={item.name} fill className="object-cover" sizes="64px" />
              </Link>
              <div className="flex-1">
                <Link href={`/shop/products/${item.productId}`} className="font-medium hover:text-blue-600">{item.name}</Link>
                <p className="text-xs text-slate-500">{item.variant} · SKU: {item.sku}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatCurrency(item.price, locale)}</p>
                <p className="text-xs">Qty: {item.qty}</p>
              </div>
            </div>
          ))}
        </DetailGridSection>

        <DetailGridSection title={t("liveTracking")} span={2}>
          <p className="mb-4 text-sm text-slate-500">{order.trackingNumber} · {order.rider}</p>
          <Link href={`/shop/orders/${id}/tracking`} className="mb-4 inline-block text-sm text-blue-600 hover:underline">{t("liveMapMock")} →</Link>
          <ActivityTimeline events={timelineEvents} />
        </DetailGridSection>

        <DetailGridSection title={t("support")}>
          <p className="text-sm text-slate-500">{t("needHelpOrder")}</p>
          <Link href={`/shop/support?order=${order.id}`} className="btn-primary mt-3 inline-block px-4 py-2 text-sm">{t("openSupportTicket")}</Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
