"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRealtime } from "@/context/realtime-context";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { OrderProducts, type OrderProductEntry } from "@/components/shop/order-products";
import { ActivityTimeline } from "@/components/ui/timeline";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyOrder, orderStatusLabel, orderStatusTitle, canCancelOrder, hasDeliveryCodeStage } from "@/lib/orders";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useShop } from "@/context/shop-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { isMobileMoneyMethod } from "@/lib/shop-live";
import { refundedTotal } from "@/lib/shop-packages";
import { dayLabel } from "@/lib/delivery-estimate";

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { addToCart } = useShop();
  const rt = useRealtime();
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const order = useMyOrder(id);
  const [code, setCode] = useState<{ orderId: string; value: string } | null>(null);
  const orderUuid = order?.id;
  const orderStatus = order?.status;

  // The customer's 4-digit handover code, only while the parcel is on its way.
  useEffect(() => {
    if (!orderUuid || !orderStatus || !hasDeliveryCodeStage(orderStatus) || rt.status !== "connected") return;
    let alive = true;
    socketClient
      .request<{ required: boolean; code: string | null }>("orders:deliveryCode", { orderId: orderUuid })
      .then((res) => {
        if (alive) setCode(res.required && res.code ? { orderId: orderUuid, value: res.code } : null);
      })
      .catch(() => {
        if (alive) setCode(null);
      });
    return () => {
      alive = false;
    };
  }, [orderUuid, orderStatus, rt.status]);

  const paymentStatusLabel = (status: string) => {
    const map: Record<string, { en: string; fr: string }> = {
      paid: { en: "Paid", fr: "Payé" },
      refunded: { en: "Refunded", fr: "Remboursé" },
      failed: { en: "Failed", fr: "Échoué" },
      pending: { en: "Pending", fr: "En attente" },
    };
    const m = map[status];
    return m ? (fr ? m.fr : m.en) : status;
  };

  // formatPaymentMethod only translates "COD"; map the remaining "Card" value locally.
  const paymentMethodLabel = (method: string) =>
    fr && method === "Card" ? "Carte" : formatPaymentMethod(method, locale);

  // The raw order carries the per-line seller state the detail view model leaves out.
  const raw = order ? rt.orders.find((o) => o.id === order.id) : undefined;
  const rawItems = raw?.items ?? [];

  function reorder() {
    if (!order) return;
    order.items.forEach((item, i) => {
      if (item.productId.startsWith("ext:")) return;
      addToCart({ id: String(item.productId), name: item.name, nameFr: item.name, price: item.price, image: item.image, seller: rawItems[i]?.sellerName ?? "", variant: item.variant || "Default", qty: item.qty });
    });
    toast(fr ? "Articles ajoutés au panier" : "Items added to cart");
    router.push("/shop/cart");
  }

  async function cancel() {
    if (!order) return;
    setCancelling(true);
    try {
      await rt.cancelOrder(order.id);
      toast(fr ? "Commande annulée" : "Order cancelled");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCancelling(false);
    }
  }

  if (!order) {
    return <div className="text-center text-slate-500">{rt.status === "connected" ? (fr ? "Commande introuvable" : "Order not found") : (fr ? "Chargement…" : "Loading…")}</div>;
  }

  const waitingApproval = order.status === "pending" && isMobileMoneyMethod(raw?.paymentMethod ?? "");
  const productEntries: OrderProductEntry[] = order.items.map((it, i) => {
    const r = rawItems[i];
    return {
      productId: it.productId,
      name: it.name,
      variant: it.variant,
      qty: it.qty,
      price: it.price,
      listPrice: it.listPrice,
      campaignPct: it.campaignPct,
      image: it.image,
      sellerId: r?.sellerId ?? null,
      sellerName: r?.sellerName ?? null,
      fulfilment: r?.fulfilment ?? "open",
      cancelReason: r?.cancelReason ?? null,
      refundedUsd: r?.refundedUsd ?? 0,
    };
  });
  const refunded = refundedTotal(productEntries);
  const showCode = code && code.orderId === order.id && hasDeliveryCodeStage(order.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.reference}
        subtitle={`${fr ? "Passée le" : "Placed"} ${order.date} · ${orderStatusLabel(order.status, fr)}`}
        backHref="/shop/orders"
        actions={
          <div className="flex flex-wrap gap-2">
            {order.status === "delivered" && (
              <>
                <button onClick={reorder} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">{fr ? "Commander à nouveau" : "Reorder"}</button>
                <Link href={`/shop/orders/${order.id}/return`} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium shadow-sm hover:border-blue-200">{fr ? "Retour" : "Return"}</Link>
                {order.items[0] && (
                  <Link href={`/shop/products/${order.items[0].productId}/reviews`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">{fr ? "Avis" : "Review"}</Link>
                )}
              </>
            )}
            {canCancelOrder(order.status) && (
              <button onClick={cancel} disabled={cancelling} className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600 disabled:opacity-50">
                {cancelling ? "…" : fr ? "Annuler" : "Cancel"}
              </button>
            )}
          </div>
        }
      />

      {waitingApproval && (
        <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          {fr
            ? "En attente d'approbation : approuvez la demande de paiement sur votre téléphone. Cette page se met à jour automatiquement."
            : "Waiting for your approval: approve the payment request on your phone. This page updates automatically."}
        </div>
      )}

      {showCode && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-sm font-medium text-emerald-800">
            {fr ? "Donnez ce code au livreur à la livraison" : "Give this code to the rider on delivery"}
          </p>
          <p className="mt-2 font-mono text-4xl font-extrabold tracking-[0.4em] text-emerald-900">{code.value}</p>
        </div>
      )}

      {order.rider && order.rider.phone && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div>
            <p className="text-sm font-medium text-blue-900">{fr ? "Votre livreur" : "Your rider"}: {order.rider.name}</p>
            <p className="text-xs text-blue-800">{order.rider.phone}</p>
          </div>
          <a href={`tel:${order.rider.phone.replace(/[^+\d]/g, "")}`} className="btn-primary inline-block px-4 py-2 text-sm">
            {fr ? `Appeler ${order.rider.name}` : `Call ${order.rider.name}`}
          </a>
        </div>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Commande" : "Order"}>
          <InfoGrid items={[
            { label: fr ? "N° de commande" : "Order ID", value: order.reference },
            { label: "Date", value: order.date },
            { label: fr ? "Statut" : "Status", value: orderStatusLabel(order.status, fr) },
            { label: "Total", value: formatCurrency(order.amount, locale) },
            { label: fr ? "Livraison estimée" : "Estimated delivery", value: dayLabel(order.estimatedDeliveryDate, fr) ?? "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Adresse de livraison" : "Delivery Address"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: order.customer },
            { label: fr ? "Téléphone" : "Phone", value: order.customerPhone || "—" },
            { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Moyen" : "Method", value: paymentMethodLabel(order.paymentMethod) },
            { label: fr ? "Statut" : "Status", value: paymentStatusLabel(order.paymentStatus) },
            { label: fr ? "Montant" : "Amount", value: formatCurrency(order.amount, locale) },
          ]} />
          <dl className="mt-4 space-y-1 border-t border-[var(--border)] pt-3 text-sm">
            <div className="flex justify-between"><dt>{fr ? "Sous-total" : "Subtotal"}</dt><dd>{formatCurrency(order.subtotal, locale)}</dd></div>
            {order.campaignDiscount > 0 && (
              <div className="flex justify-between text-amber-800"><dt>{fr ? "Dont promotions déjà déduites" : "Promotions already deducted"}</dt><dd>{formatCurrency(order.campaignDiscount, locale)}</dd></div>
            )}
            {order.discount > 0 && (
              <div className="flex justify-between text-emerald-700"><dt>{fr ? "Code promo" : "Promo code"}</dt><dd>-{formatCurrency(order.discount, locale)}</dd></div>
            )}
            <div className="flex justify-between"><dt>{fr ? "Livraison" : "Delivery"}</dt><dd>{order.deliveryFee === 0 ? (fr ? "Gratuite" : "Free") : formatCurrency(order.deliveryFee, locale)}</dd></div>
            <div className="flex justify-between border-t border-[var(--border)] pt-1 font-semibold"><dt>Total</dt><dd>{formatCurrency(order.amount, locale)}</dd></div>
            {refunded > 0 && (
              <div className="flex justify-between text-emerald-700"><dt>{fr ? "Remboursé" : "Refunded"}</dt><dd>-{formatCurrency(refunded, locale)}</dd></div>
            )}
          </dl>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits" : "Products"} span={3}>
          <OrderProducts order={{ status: order.status, paymentMethod: raw?.paymentMethod ?? order.paymentMethodId }} items={productEntries} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Suivi de commande" : "Order Tracking"} span={2}>
          <Link href={`/shop/orders/${order.id}/tracking`} className="mb-4 inline-block text-sm text-[var(--primary)] hover:underline">{fr ? "Suivre la livraison →" : "Track delivery →"}</Link>
          <ActivityTimeline events={order.timeline.map((e) => ({ ...e, label: orderStatusTitle(e.label, fr) }))} />
        </DetailGridSection>

        <DetailGridSection title="Support">
          <p className="text-sm text-slate-500">{fr ? "Besoin d'aide avec cette commande ?" : "Need help with this order?"}</p>
          <Link href={`/shop/support?order=${order.id}`} className="btn-primary mt-3 inline-block px-4 py-2 text-sm">{fr ? "Ouvrir un ticket de support" : "Open Support Ticket"}</Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}

export default function ShopOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/orders/${id}`}>
      <OrderDetail />
    </RequireSignIn>
  );
}
