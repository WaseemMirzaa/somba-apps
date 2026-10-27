"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRealtime } from "@/context/realtime-context";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { OrderProducts, type OrderProductEntry } from "@/components/shop/order-products";
import { StepList } from "@/components/shop/step-list";
import { ContactSeller } from "@/components/shop/contact-seller";
import { customerJourney } from "@/lib/order-journey";
import { useHubDirectory } from "@/lib/shop-engage";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyOrder, orderStatusLabel, canCancelOrder, hasDeliveryCodeStage, useDeliveryCode } from "@/lib/orders";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useShop } from "@/context/shop-context";
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
  const hubs = useHubDirectory();
  const code = useDeliveryCode(order?.id, order?.status);

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

  // The raw order carries the per-line seller state the detail view model leaves out.
  const raw = order ? rt.orders.find((o) => o.id === order.id) : undefined;
  const rawItems = raw?.items ?? [];

  function reorder() {
    if (!order) return;
    order.items.forEach((item, i) => {
      if (item.productId.startsWith("ext:")) return;
      addToCart({ id: String(item.productId), name: item.name, nameFr: item.nameFr, price: item.price, image: item.image, seller: rawItems[i]?.sellerName ?? "", variant: item.variant || "Default", qty: item.qty });
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
      nameFr: it.nameFr,
      variant: it.variant,
      variantFr: it.variantFr,
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
  const showCode = code && hasDeliveryCodeStage(order.status);
  const steps = raw ? customerJourney(raw, hubs, fr) : [];
  const destHub = raw?.destinationHubId ? hubs.get(raw.destinationHubId) : undefined;
  const requests = rt.disputes.filter((d) => d.orderId === order.id);
  const sellers = [...new Map(rawItems.filter((i) => i.sellerId).map((i) => [i.sellerId as string, i.sellerName ?? ""])).entries()];
  const reportable = ["shipped", "out_for_delivery", "delivered"].includes(order.status);

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
                <Link href={`/shop/orders/${order.id}/exchange`} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium shadow-sm hover:border-blue-200">{fr ? "Remplacer / échanger" : "Replace / exchange"}</Link>
                {order.items[0] && (
                  <Link href={`/shop/products/${order.items[0].productId}/reviews`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">{fr ? "Avis" : "Review"}</Link>
                )}
              </>
            )}
            {reportable && (
              <Link href={`/shop/orders/${order.id}/dispute`} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100">{fr ? "Signaler un problème" : "Report a problem"}</Link>
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
          <p className="mt-2 font-mono text-4xl font-extrabold tracking-[0.4em] text-emerald-900">{code}</p>
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
            { label: fr ? "Moyen" : "Method", value: formatPaymentMethod(order.paymentMethodId ?? order.paymentMethod, locale) },
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
            <div className="flex justify-between"><dt>{fr ? "Livraison" : "Delivery"}{destHub ? ` (${destHub.name})` : ""}</dt><dd>{order.deliveryFee === 0 ? (fr ? "Gratuite" : "Free") : formatCurrency(order.deliveryFee, locale)}</dd></div>
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
          <StepList steps={steps} fr={fr} />
        </DetailGridSection>

        <DetailGridSection title="Support">
          <p className="text-sm text-slate-500">{fr ? "Besoin d'aide avec cette commande ?" : "Need help with this order?"}</p>
          <div className="mt-3 flex flex-col items-start gap-2">
            <Link href={`/shop/support?order=${order.id}`} className="btn-primary inline-block px-4 py-2 text-sm">{fr ? "Ouvrir un ticket de support" : "Open Support Ticket"}</Link>
            {sellers.map(([sid, name]) => (
              <ContactSeller key={sid} sellerId={sid} orderId={order.id} fr={fr} label={fr ? `Écrire à ${name}` : `Message ${name}`} returnTo={`/shop/orders/${order.id}`} />
            ))}
          </div>
          {requests.length > 0 && (
            <div className="mt-4 border-t border-[var(--border)] pt-3" data-testid="order-requests">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Demandes liées" : "Related requests"}</p>
              <ul className="space-y-1 text-sm">
                {requests.map((d) => (
                  <li key={d.id}><Link href={`/shop/returns/${d.id}`} className="text-[var(--primary)] hover:underline">{d.reference}</Link> <span className="text-xs text-slate-500">· {d.type === "return" ? (fr ? "Retour" : "Return") : fr ? "Litige" : "Dispute"}</span></li>
                ))}
              </ul>
            </div>
          )}
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
