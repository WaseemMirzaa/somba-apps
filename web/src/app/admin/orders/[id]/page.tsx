"use client";

import { paymentMethodLabel } from "@/lib/seller-labels";
import { localDay, localDateTime } from "@/lib/dates";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { commissionRateOf, liveCommission } from "@/lib/seller-packages";
import { SectionLoading } from "@/components/admin/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { RefundDialog } from "@/components/admin/refund-dialog";
import { OrderRouting } from "@/components/admin/order-routing";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import {
  ORDER_STATUS_BADGE,
  canAdminCancel,
  canMoveMoney,
  errMsg,
  nextOrderStatuses,
  orderStatusLabel as liveStatusLabel,
  useRole,
  useServerList,
  type PaymentRow,
} from "@/lib/admin-live";
import { LEG_STATUS, pickL } from "@/lib/logistics";
import {
  PACKAGE_STATUS_BADGE,
  PACKAGE_STATUS_LABEL,
  groupPackages,
  lineFulfilment,
  totalLineRefunds,
} from "@/lib/order-packages";
import type { Seller } from "@/lib/realtime/types";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { dayLabel } from "@/lib/delivery-estimate";
import { useLocale } from "@/context/locale-context";
import { localized, variantDisplay } from "@/lib/i18n-fields";
import { adminBreadcrumb } from "@/lib/admin-i18n";

const PAYMENT_STATUS_FR: Record<string, string> = {
  succeeded: "Réussi",
  failed: "Échoué",
  refunded: "Remboursé",
  pending: "En attente",
};

function parseAddress(raw: string | null): string {
  if (!raw) return "—";
  try {
    const a = JSON.parse(raw) as { line1?: string; city?: string };
    return [a.line1, a.city].filter(Boolean).join(", ") || "—";
  } catch {
    return raw;
  }
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const role = useRole();
  const live = rt.orders.find((o) => o.id === id || o.reference === id);
  const task = rt.deliveries.find((d) => live && d.orderId === live.id && (!d.kind || d.kind === "delivery"));
  const payment = rt.payments.find((p) => live && p.orderId === live.id && (p as PaymentRow).purpose !== "topup");
  const sellerList = useServerList<Seller>("sellers:list", { pushEvents: ["seller:updated"] });
  const [confirm, setConfirm] = useState<{ kind: "status"; status: string } | { kind: "refund" } | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (!live) {
    if (rt.status !== "connected" || rt.orders.length === 0) return <SectionLoading className="min-h-[40vh]" />;
    return <div className="p-8 text-center text-slate-500">{fr ? "Commande introuvable" : "Order not found"}</div>;
  }
  const order = {
    id: live.reference,
    date: localDay(live.createdAt),
    status: live.status,
    amount: live.totalUsd,
    itemsCount: live.items.reduce((s, it) => s + it.qty, 0),
    customer: live.customerName,
    customerId: live.customerId,
    address: parseAddress(live.shippingAddress),
  };
  const itemsValue = live.items.reduce((s, it) => s + it.priceUsd * it.qty, 0);
  // Commission = what was STORED on each line when the order was placed (never today's rate), on the lines
  // the sellers still sell: lines they cancelled earn nothing.
  const soldLines = live.items.filter((it) => it.fulfilment !== "cancelled");
  const commission = soldLines.every((it) => typeof it.commissionUsd === "number") ? liveCommission(soldLines, 0) : null;
  const commissionRate = commissionRateOf(soldLines);
  const commissionSuffix = commissionRate === "mixed" ? (fr ? " (taux variés)" : " (mixed)") : commissionRate !== null ? (fr ? ` (${commissionRate} %)` : ` (${commissionRate}%)`) : "";
  const timeline = [
    { time: localDateTime(live.createdAt), label: fr ? "Passée" : "Placed", done: true },
    ...(live.updatedAt !== live.createdAt
      ? [{ time: localDateTime(live.updatedAt), label: `${fr ? "Statut" : "Status"}: ${liveStatusLabel(live.status, fr)}`, done: live.status === "delivered" }]
      : []),
  ];

  const orderStatusLabel = liveStatusLabel(order.status, fr);
  const nextStatuses = nextOrderStatuses(order.status);
  const canCancel = canAdminCancel(order.status);
  const mayRefund = canMoveMoney(role);
  const paymentRefunded = payment?.status === "refunded";
  const canRefund = mayRefund && !!payment && payment.status === "succeeded";

  // Lines from older orders carry no seller snapshot: fall back to the product's owner.
  const owner = new Map(rt.products.map((p) => [p.id, p]));
  const lines = live.items.map((it) => {
    if (it.sellerId || it.sellerName) return it;
    const p = owner.get(it.productId);
    return { ...it, sellerId: p?.sellerId ?? null, sellerName: p?.sellerName ?? null };
  });
  const packages = groupPackages(
    { status: live.status, paymentMethod: live.paymentMethod, paid: payment?.status === "succeeded" || payment?.status === "refunded" },
    lines,
  );
  const walletRefunds = totalLineRefunds(live.items);
  const knownSellers = new Set(sellerList.items.map((x) => x.id));

  async function runAction() {
    if (!confirm || !live) return;
    setBusy(true);
    setActionError(null);
    try {
      if (confirm.kind === "status") {
        await socketClient.request("orders:updateStatus", { orderId: live.id, status: confirm.status });
        toast(fr ? "Statut mis à jour" : "Status updated", "success");
      } else {
        await socketClient.request("orders:refund", { orderId: live.id, toWallet: true });
        toast(fr ? "Remboursement effectué" : "Refund issued", "success");
      }
      setConfirm(null);
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCancel() {
    if (!live) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError(fr ? "Un motif d'annulation est requis." : "A cancellation reason is required.");
      return;
    }
    setBusy(true);
    setCancelError(null);
    try {
      await socketClient.request("orders:adminCancel", { orderId: live.id, reason });
      toast(fr ? "Commande annulée" : "Order cancelled", "success");
      setCancelOpen(false);
      setCancelReason("");
    } catch (e) {
      setCancelError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const confirmText = !confirm
    ? ""
    : confirm.kind === "status"
      ? confirm.status === "delivered"
        ? fr
          ? "Marquer la commande comme « Livrée » ? Le flux livreur est ignoré ; le paiement à la livraison est enregistré comme encaissé. Le client est notifié."
          : 'Mark this order as "Delivered"? The rider flow is skipped; cash on delivery is recorded as collected. The customer is notified.'
        : fr
          ? `Passer la commande à « ${liveStatusLabel(confirm.status, true)} » ? Le client est notifié.`
          : `Move this order to "${liveStatusLabel(confirm.status, false)}"? The customer is notified.`
      : fr
        ? "Rembourser le paiement sur le portefeuille du client ?"
        : "Refund the payment to the customer's wallet?";

  return (
    <div className="space-y-6">
      <RefundDialog
        target={refundOpen && live && payment ? { orderId: live.id, orderReference: payment.orderReference ?? order.id, amountUsd: payment.amountUsd, method: payment.method } : null}
        fr={fr}
        locale={locale}
        onClose={() => setRefundOpen(false)}
      />
      <PageHeader
        title={order.id}
        subtitle={`${order.date} · ${orderStatusLabel} · ${formatCurrency(order.amount, locale)}`}
        backHref="/admin/orders"
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: t("orders"), href: "/admin/orders" },
          { label: order.id },
        ]}
        actions={<Badge variant={ORDER_STATUS_BADGE[order.status] ?? "info"}>{orderStatusLabel}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Actions" : "Actions"} span={3}>
          {!live ? (
            <p className="text-sm text-slate-500">{fr ? "Données temps réel indisponibles pour cette commande." : "Live data is not available for this order."}</p>
          ) : confirm ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800">{confirmText}</p>
              <ErrorNote message={actionError} />
              <div className="flex gap-2">
                <Button size="sm" variant={confirm.kind === "refund" ? "danger" : "primary"} onClick={runAction} disabled={busy}>
                  {busy ? "…" : fr ? "Confirmer" : "Confirm"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setConfirm(null); setActionError(null); }} disabled={busy}>
                  {fr ? "Retour" : "Back"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {nextStatuses.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{fr ? "Passer à" : "Move to"}</span>
                  {nextStatuses.map((st) => (
                    <Button key={st} size="sm" variant="secondary" onClick={() => { setActionError(null); setConfirm({ kind: "status", status: st }); }}>
                      {liveStatusLabel(st, fr)}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {canCancel && (
                  <Button size="sm" variant="reject" onClick={() => { setCancelError(null); setCancelOpen(true); }}>
                    {fr ? "Annuler la commande" : "Cancel order"}
                  </Button>
                )}
                {canRefund && (
                  <Button size="sm" variant="reject" onClick={() => setRefundOpen(true)}>
                    {fr ? "Rembourser" : "Refund"}
                  </Button>
                )}
                {paymentRefunded && <Badge variant="default">{fr ? "Paiement déjà remboursé" : "Payment already refunded"}</Badge>}
              </div>
              {nextStatuses.length === 0 && !canCancel && !canRefund && !paymentRefunded && (
                <p className="text-sm text-slate-500">{fr ? "Aucune action disponible pour ce statut." : "No actions available for this status."}</p>
              )}
              {canRefund && (
                <p className="text-xs text-slate-500">
                  {fr
                    ? "Remboursement vers le portefeuille du client, ou vers le téléphone qui a payé quand pawaPay est connecté."
                    : "Refund to the customer's wallet, or to the phone that paid when pawaPay is connected."}
                </p>
              )}
              {actionError && <ErrorNote message={actionError} />}
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande" : "Order"}>
          <InfoGrid items={[
            { label: fr ? "ID commande" : "Order ID", value: order.id },
            { label: fr ? "Date" : "Date", value: order.date },
            { label: fr ? "Statut" : "Status", value: orderStatusLabel },
            { label: fr ? "Articles" : "Items", value: order.itemsCount },
            { label: fr ? "Livraison estimée" : "Estimated delivery", value: dayLabel(live.estimatedDeliveryDate, fr) ?? "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: <Link href={`/admin/customers/${order.customerId}`} className="text-[var(--primary)] hover:underline">{order.customer}</Link> },
            { label: fr ? "Adresse de livraison" : "Shipping address", value: order.address, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Méthode" : "Method", value: paymentMethodLabel(payment?.method ?? live.paymentMethod, fr) },
            { label: fr ? "Référence paiement" : "Payment reference", value: payment?.reference ?? "—" },
            { label: fr ? "Statut" : "Status", value: payment ? (fr ? (PAYMENT_STATUS_FR[payment.status] ?? payment.status) : payment.status) : (fr ? "Aucun paiement enregistré" : "No payment recorded") },
            { label: fr ? "Montant" : "Amount", value: formatCurrency(payment?.amountUsd ?? order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Logistique" : "Logistics"}>
          <InfoGrid items={[
            { label: fr ? "Livraison" : "Delivery task", value: task ? pickL(LEG_STATUS[task.status], fr, task.status.replace(/_/g, " ")) : "—" },
            { label: fr ? "Livreur assigné" : "Rider assigned", value: live.riderId ? (fr ? "Oui" : "Yes") : "—" },
            { label: fr ? "COD à encaisser" : "COD to collect", value: task && task.codAmountUsd > 0 ? formatCurrency(task.codAmountUsd, locale) : "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Acheminement par les entrepôts" : "Routing through the warehouses"} span={3}>
          <OrderRouting order={live} sellers={sellerList.items} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Montants" : "Amounts"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Articles" : "Items", value: formatCurrency(itemsValue, locale) },
            { label: fr ? "Livraison" : "Delivery", value: formatCurrency(live.deliveryFeeUsd, locale) },
            { label: fr ? "Remise campagne" : "Campaign discount", value: formatCurrency(live.campaignDiscountUsd ?? 0, locale) },
            { label: fr ? "Remise code promo" : "Promo discount", value: formatCurrency(live.discountUsd ?? 0, locale) },
            { label: fr ? "Total" : "Total", value: formatCurrency(live.totalUsd, locale) },
            { label: `Commission${commissionSuffix}`, value: commission === null ? "—" : formatCurrency(commission, locale) },
            // One figure: a full refund covers the whole payment (seller-cancelled lines included, never twice);
            // otherwise what sellers' cancellations already gave back to the wallet.
            { label: fr ? "Remboursé" : "Refunded", value: formatCurrency(paymentRefunded ? (payment?.amountUsd ?? 0) : walletRefunds, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? `Colis (${packages.length})` : `Packages (${packages.length})`} span={3}>
          <div className="space-y-4">
            {packages.length > 1 && (
              <p className="text-xs text-slate-500">
                {fr
                  ? "Une seule commande, un seul paiement, une seule livraison : chaque vendeur prépare ses propres articles."
                  : "One order, one payment, one delivery: each seller packs their own lines."}
              </p>
            )}
            {packages.map((pkg, i) => (
              <div key={pkg.sellerId || `unknown-${i}`} className="rounded-lg border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    {pkg.sellerId && knownSellers.has(pkg.sellerId) ? (
                      <Link href={`/admin/sellers/${pkg.sellerId}`} className="font-semibold text-[var(--primary)] hover:underline">
                        {pkg.sellerName || pkg.sellerId}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-900">{pkg.sellerName || (fr ? "Vendeur inconnu" : "Unknown seller")}</span>
                    )}
                    <p className="text-xs text-slate-500">
                      {fr ? "Sous-total" : "Subtotal"}: {formatCurrency(pkg.subtotalUsd, locale)}
                      {pkg.readyAt ? ` · ${fr ? "Prêt" : "Ready"}: ${localDateTime(pkg.readyAt)}` : ""}
                      {pkg.receivedAt ? ` · ${fr ? "Reçu au hub" : "Received at hub"}: ${localDateTime(pkg.receivedAt)}` : ""}
                    </p>
                  </div>
                  <Badge variant={PACKAGE_STATUS_BADGE[pkg.status]}>{PACKAGE_STATUS_LABEL[pkg.status][fr ? "fr" : "en"]}</Badge>
                </div>
                <ul className="mt-3 space-y-2">
                  {pkg.lines.map((item) => {
                    const cancelled = lineFulfilment(item) === "cancelled";
                    return (
                      <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <span className={cancelled ? "text-slate-400 line-through" : "text-slate-800"}>
                            {localized(item, "productName", fr)}{item.variant ? ` · ${variantDisplay(item.variant, fr ? item.variantFr : null, fr)}` : ""} × {item.qty}
                          </span>
                          {cancelled && (
                            <p className="text-xs text-red-600">
                              {fr ? "Annulé" : "Cancelled"}
                              {item.cancelReason ? ` — ${item.cancelReason}` : ""}
                              {(item.refundedUsd ?? 0) > 0
                                ? ` · ${fr ? "Remboursé" : "Refunded"}: ${formatCurrency(item.refundedUsd ?? 0, locale)}`
                                : ""}
                            </p>
                          )}
                        </div>
                        <span className="text-slate-600">{formatCurrency(item.priceUsd * item.qty, locale)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {walletRefunds > 0 && (
              <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm font-medium">
                <span>{fr ? "Remboursé sur le portefeuille" : "Refunded to wallet"}</span>
                <span>{formatCurrency(walletRefunds, locale)}</span>
              </div>
            )}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Détails du produit" : "Product Details"} span={3}>
          <div className="space-y-4">
            {live.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border)] p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/products/${item.productId}`} className="font-medium text-[var(--primary)] hover:underline">{localized(item, "productName", fr)}</Link>
                  {item.variant && <p className="text-xs text-slate-500">{fr ? "Variante" : "Variant"}: {variantDisplay(item.variant, fr ? item.variantFr : null, fr)}</p>}
                  {item.campaignPct ? <p className="text-xs text-emerald-600">{fr ? `Campagne -${item.campaignPct}%` : `Campaign -${item.campaignPct}%`}</p> : null}
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(item.priceUsd, locale)}</p>
                  {item.listPriceUsd && item.listPriceUsd > item.priceUsd ? <p className="text-xs text-slate-400 line-through">{formatCurrency(item.listPriceUsd, locale)}</p> : null}
                  <p className="text-xs text-slate-500">{fr ? "Qté" : "Qty"}: {item.qty}</p>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie d'activité" : "Activity Timeline"} span={3}>
          <ActivityTimeline events={timeline} />
        </DetailGridSection>
      </DetailGrid>

      <Modal
        open={cancelOpen}
        onClose={() => !busy && setCancelOpen(false)}
        title={fr ? "Annuler la commande" : "Cancel order"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCancelOpen(false)} disabled={busy}>{fr ? "Retour" : "Back"}</Button>
            <Button variant="danger" size="sm" onClick={runCancel} disabled={busy || !cancelReason.trim()}>
              {busy ? "…" : fr ? "Annuler la commande" : "Cancel order"}
            </Button>
          </>
        }
      >
        <p>
          {fr
            ? "Le stock est remis en vente et les paiements reçus sont remboursés. Le client est notifié avec le motif."
            : "Stock is restored and any received payment is refunded. The customer is notified with the reason."}
        </p>
        <label className="block text-xs font-medium text-slate-600" htmlFor="cancel-reason">
          {fr ? "Motif (obligatoire)" : "Reason (required)"}
        </label>
        <textarea
          id="cancel-reason"
          className="input-premium w-full px-3 py-2 text-sm"
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
        <ErrorNote message={cancelError} />
      </Modal>
    </div>
  );
}
