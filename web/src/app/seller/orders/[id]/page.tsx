"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getSellerOrder } from "@/lib/seller-entities";
import { resolveWarehouseHubHref } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { localizedField, mapTimelineEvents } from "@/lib/locale-helpers";
import { useToast } from "@/context/toast-context";

const UNAVAILABLE_REASONS = [
  { id: "out_of_stock", label: "Out of stock", labelFr: "Rupture de stock" },
  { id: "damaged", label: "Damaged", labelFr: "Endommagé" },
  { id: "discontinued", label: "Discontinued", labelFr: "Discontinué" },
];

export default function SellerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const order = getSellerOrder(id);
  const [ready, setReady] = useState(false);
  const [flaggedSku, setFlaggedSku] = useState<string | null>(null);
  const [unavailReason, setUnavailReason] = useState(UNAVAILABLE_REASONS[0].id);
  const [showFlagModal, setShowFlagModal] = useState(false);

  if (!order) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${order.customer} · ${order.orderStatus}`}
        backHref="/seller/orders"
        actions={
          !ready && order.shippingStatus !== "ready" ? (
            <div className="flex gap-2">
              <button onClick={() => { setReady(true); toast(t("markedReadyForPickup")); }} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white">
                {t("packageReady")}
              </button>
              <button onClick={() => setShowFlagModal(true)} className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700">
                {t("flagUnavailable")}
              </button>
            </div>
          ) : ready ? (
            <span className="text-sm text-emerald-600">{t("readyForPickup")}</span>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title={t("orderSection")}>
          <InfoGrid items={[
            { label: t("orderId"), value: order.id },
            { label: t("date"), value: order.date },
            { label: t("status"), value: order.orderStatus },
            { label: t("amount"), value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customerSection")}>
          <InfoGrid items={[
            { label: t("name"), value: order.customer },
            { label: t("phone"), value: order.customerPhone },
            { label: t("city"), value: order.customerCity },
            { label: t("address"), value: order.customerAddress, full: true },
          ]} />
          <div className="mt-4 flex gap-3">
            <a href={`tel:${order.customerPhone}`} className="text-sm text-sky-600">{t("callCustomer")}</a>
            <Link href="/seller/support" className="text-sm text-slate-500">{t("openSupportTicket")}</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title={t("paymentSection")}>
          <InfoGrid items={[
            { label: t("method"), value: order.paymentMethod },
            { label: t("transaction"), value: order.transactionId },
            { label: "Status", value: order.paymentStatus },
            { label: "Commission", value: formatCurrency(order.commission, locale) },
            { label: "Net Earnings", value: formatCurrency(order.netEarnings, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Shipping">
          <InfoGrid items={[
            { label: "Warehouse", value: <Link href={resolveWarehouseHubHref("WH-KIN")} className="text-sky-600 hover:underline">{order.warehouse}</Link> },
            { label: "Pickup Rider", value: order.pickupRider },
            { label: "Tracking Status", value: order.trackingStatus },
            { label: "Pickup ETA", value: order.pickupEta },
          ]} />
          <div className="mt-4 flex gap-3">
            <Link href={`/seller/shipping/SHP-${order.id.replace("ORD-", "")}`} className="text-sm text-sky-600 hover:underline">View Shipment →</Link>
            <Link href={resolveWarehouseHubHref("WH-KIN")} className="text-sm text-sky-600 hover:underline">Warehouse Detail →</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title="Items" span={3}>
          {order.items_detail.map((item) => (
            <div key={item.sku} className={`mb-4 flex gap-4 last:mb-0 ${flaggedSku === item.sku ? "rounded-lg border border-amber-200 bg-amber-50 p-2" : ""}`}>
              <div className="relative h-14 w-14 overflow-hidden rounded-lg">
                <Image src={item.image} alt={item.name} fill className="object-cover" sizes="56px" />
              </div>
              <div className="flex-1">
                <Link href={`/seller/products/${item.productId}`} className="font-medium text-sky-600 hover:underline">{item.name}</Link>
                <p className="text-xs text-slate-500">{item.variant} · {item.sku}</p>
              </div>
              <div className="text-right">
                <p>{formatCurrency(item.price, locale)}</p>
                <p className="text-xs">Qty: {item.qty}</p>
              </div>
            </div>
          ))}
        </DetailGridSection>

        <DetailGridSection title={t("timeline")} span={3}>
          <ActivityTimeline events={mapTimelineEvents(locale, order.timeline)} />
        </DetailGridSection>
      </DetailGrid>

      {showFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-premium w-full max-w-md p-6">
            <h3 className="font-semibold">{t("flagItemUnavailable")}</h3>
            <select className="input-premium mt-3 w-full px-3 py-2 text-sm" value={order.items_detail[0]?.sku} onChange={(e) => setFlaggedSku(e.target.value)}>
              {order.items_detail.map((item) => (
                <option key={item.sku} value={item.sku}>{item.name}</option>
              ))}
            </select>
            <select className="input-premium mt-2 w-full px-3 py-2 text-sm" value={unavailReason} onChange={(e) => setUnavailReason(e.target.value)}>
              {UNAVAILABLE_REASONS.map((r) => (
                <option key={r.id} value={r.id}>{localizedField(locale, r.label, r.labelFr)}</option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowFlagModal(false)} className="flex-1 rounded-xl border py-2 text-sm">Cancel</button>
              <button onClick={() => { setFlaggedSku(order.items_detail[0]?.sku ?? null); setShowFlagModal(false); toast(t("itemFlaggedPartialRefund")); }} className="flex-1 rounded-xl bg-amber-600 py-2 text-sm text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
