"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/admin/modal";
import { useAdminData } from "@/lib/admin";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import {
  ORDER_STATUS_BADGE,
  canMoveMoney,
  errMsg,
  nextOrderStatuses,
  orderStatusLabel as liveStatusLabel,
  useRole,
  type PaymentRow,
} from "@/lib/admin-live";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";

const PAYMENT_STATUS_FR: Record<string, string> = {
  succeeded: "Réussi",
  failed: "Échoué",
  refunded: "Remboursé",
  pending: "En attente",
};

const TIMELINE_LABEL_FR: Record<string, string> = {
  Placed: "Passée",
  Paid: "Payée",
  Packed: "Emballée",
  Picked: "Préparée",
  Warehouse: "Entrepôt",
  Dispatched: "Expédiée",
  Delivered: "Livrée",
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { getOrder } = useAdminData();
  const rt = useRealtime();
  const { toast } = useToast();
  const role = useRole();
  const order = getOrder(id);
  const live = rt.orders.find((o) => o.id === id || o.reference === id || o.id === order?.orderId);
  const payment = rt.payments.find((p) => live && p.orderId === live.id && (p as PaymentRow).purpose !== "topup");
  const [confirm, setConfirm] = useState<
    { kind: "status"; status: string } | { kind: "cancel" } | { kind: "refund"; toWallet: boolean } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!order) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Commande introuvable" : "Order not found"}</div>;
  }

  const orderStatusLabel = liveStatusLabel(order.status, fr);
  const nextStatuses = nextOrderStatuses(order.status);
  const canCancel = order.status === "pending" || order.status === "confirmed";
  const mayRefund = canMoveMoney(role);
  const paymentRefunded = payment?.status === "refunded";
  const canRefund = mayRefund && !!payment && payment.status === "succeeded";

  async function runAction() {
    if (!confirm || !live) return;
    setBusy(true);
    setActionError(null);
    try {
      if (confirm.kind === "status") {
        await socketClient.request("orders:updateStatus", { orderId: live.id, status: confirm.status });
        toast(fr ? "Statut mis à jour" : "Status updated", "success");
      } else if (confirm.kind === "cancel") {
        await socketClient.request("orders:cancel", { orderId: live.id });
        toast(fr ? "Commande annulée" : "Order cancelled", "success");
      } else {
        await socketClient.request("orders:refund", { orderId: live.id, toWallet: confirm.toWallet });
        toast(fr ? "Remboursement effectué" : "Refund issued", "success");
      }
      setConfirm(null);
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const confirmText = !confirm
    ? ""
    : confirm.kind === "status"
      ? fr
        ? `Passer la commande à « ${liveStatusLabel(confirm.status, true)} » ? Le client est notifié.`
        : `Move this order to "${liveStatusLabel(confirm.status, false)}"? The customer is notified.`
      : confirm.kind === "cancel"
        ? fr
          ? "Annuler la commande ? Le stock est remis en vente et les paiements reçus sont remboursés."
          : "Cancel this order? Stock is restored and any received payment is refunded."
        : confirm.toWallet
          ? fr
            ? "Rembourser le paiement sur le portefeuille du client ?"
            : "Refund the payment to the customer's wallet?"
          : fr
            ? "Rembourser le paiement via le moyen de paiement d'origine ?"
            : "Refund the payment to the original payment method?";

  return (
    <div className="space-y-6">
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
                <Button size="sm" variant={confirm.kind === "cancel" ? "danger" : "primary"} onClick={runAction} disabled={busy}>
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
                  <Button size="sm" variant="reject" onClick={() => { setActionError(null); setConfirm({ kind: "cancel" }); }}>
                    {fr ? "Annuler la commande" : "Cancel order"}
                  </Button>
                )}
                {canRefund && (
                  <>
                    <Button size="sm" variant="reject" onClick={() => { setActionError(null); setConfirm({ kind: "refund", toWallet: true }); }}>
                      {fr ? "Rembourser (portefeuille)" : "Refund to wallet"}
                    </Button>
                    <Button size="sm" variant="reject" onClick={() => { setActionError(null); setConfirm({ kind: "refund", toWallet: false }); }}>
                      {fr ? "Rembourser (moyen d'origine)" : "Refund to original method"}
                    </Button>
                  </>
                )}
                {paymentRefunded && <Badge variant="default">{fr ? "Paiement déjà remboursé" : "Payment already refunded"}</Badge>}
              </div>
              {nextStatuses.length === 0 && !canCancel && !canRefund && !paymentRefunded && (
                <p className="text-sm text-slate-500">{fr ? "Aucune action disponible pour ce statut." : "No actions available for this status."}</p>
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
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: <Link href={`/admin/customers/${order.customerId}`} className="text-[var(--primary)] hover:underline">{order.customer}</Link> },
            { label: fr ? "Téléphone" : "Phone", value: order.customerPhone },
            { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
            { label: fr ? "Ville" : "City", value: order.customerCity },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid items={[
            { label: fr ? "Boutique" : "Store", value: order.sellerId ? <Link href={`/admin/sellers/${order.sellerId}`} className="text-[var(--primary)] hover:underline">{order.seller}</Link> : order.seller },
            { label: fr ? "ID vendeur" : "Seller ID", value: order.sellerId ?? "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Méthode" : "Method", value: payment?.method ?? order.paymentMethod },
            { label: fr ? "Référence paiement" : "Payment reference", value: payment?.reference ?? "—" },
            { label: fr ? "Statut" : "Status", value: payment ? (fr ? (PAYMENT_STATUS_FR[payment.status] ?? payment.status) : payment.status) : (fr ? "Aucun paiement enregistré" : "No payment recorded") },
            { label: fr ? "Montant" : "Amount", value: formatCurrency(payment?.amountUsd ?? order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Logistique" : "Logistics"}>
          <InfoGrid items={[
            { label: fr ? "Entrepôt" : "Warehouse", value: order.warehouse },
            { label: fr ? "Livreur" : "Rider", value: order.rider },
            { label: fr ? "Numéro de suivi" : "Tracking Number", value: order.trackingNumber },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Finances" : "Financial"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Montant de la commande" : "Order Amount", value: formatCurrency(order.amount, locale) },
            { label: fr ? "Commission" : "Commission", value: formatCurrency(order.commission, locale) },
            { label: fr ? "Gains du vendeur" : "Seller Earnings", value: formatCurrency(order.sellerEarnings, locale) },
            { label: fr ? "Remboursements" : "Refunds", value: formatCurrency(paymentRefunded ? (payment?.amountUsd ?? order.refunds) : order.refunds, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Détails du produit" : "Product Details"} span={3}>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div key={item.sku} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="64px" />
                </div>
                <div className="flex-1">
                  <Link href={`/admin/products/${item.productId}`} className="font-medium text-[var(--primary)] hover:underline">{item.name}</Link>
                  <p className="text-xs text-slate-500">SKU: {item.sku} · {fr ? "Variante" : "Variant"}: {item.variant}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(item.price, locale)}</p>
                  <p className="text-xs text-slate-500">{fr ? "Qté" : "Qty"}: {item.qty}</p>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie d'activité" : "Activity Timeline"} span={3}>
          <ActivityTimeline events={fr ? order.timeline.map((e) => ({ ...e, label: TIMELINE_LABEL_FR[e.label] ?? e.label })) : order.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
