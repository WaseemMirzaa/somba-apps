"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { useSocketQuery } from "@/lib/admin-stats";
import { SectionLoading } from "@/components/admin/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/admin/modal";
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
  const settings = useSocketQuery<Record<string, string>>("settings:get");
  const task = rt.deliveries.find((d) => live && d.orderId === live.id);
  const payment = rt.payments.find((p) => live && p.orderId === live.id && (p as PaymentRow).purpose !== "topup");
  const [confirm, setConfirm] = useState<
    { kind: "status"; status: string } | { kind: "cancel" } | { kind: "refund"; toWallet: boolean } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!live) {
    if (rt.status !== "connected" || rt.orders.length === 0) return <SectionLoading className="min-h-[40vh]" />;
    return <div className="p-8 text-center text-slate-500">{fr ? "Commande introuvable" : "Order not found"}</div>;
  }
  const order = {
    id: live.reference,
    date: live.createdAt.slice(0, 10),
    status: live.status,
    amount: live.totalUsd,
    itemsCount: live.items.reduce((s, it) => s + it.qty, 0),
    customer: live.customerName,
    customerId: live.customerId,
    address: parseAddress(live.shippingAddress),
  };
  const itemsValue = live.items.reduce((s, it) => s + it.priceUsd * it.qty, 0);
  const commissionPct = Number(settings.data?.commissionPct ?? NaN);
  const commission = Number.isFinite(commissionPct) ? (itemsValue * commissionPct) / 100 : null;
  const timeline = [
    { time: live.createdAt.slice(0, 16).replace("T", " "), label: fr ? "Passée" : "Placed", done: true },
    ...(live.updatedAt !== live.createdAt
      ? [{ time: live.updatedAt.slice(0, 16).replace("T", " "), label: `${fr ? "Statut" : "Status"}: ${liveStatusLabel(live.status, fr)}`, done: live.status === "delivered" }]
      : []),
  ];

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
            { label: fr ? "Adresse de livraison" : "Shipping address", value: order.address, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Méthode" : "Method", value: payment?.method ?? live.paymentMethod },
            { label: fr ? "Référence paiement" : "Payment reference", value: payment?.reference ?? "—" },
            { label: fr ? "Statut" : "Status", value: payment ? (fr ? (PAYMENT_STATUS_FR[payment.status] ?? payment.status) : payment.status) : (fr ? "Aucun paiement enregistré" : "No payment recorded") },
            { label: fr ? "Montant" : "Amount", value: formatCurrency(payment?.amountUsd ?? order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Logistique" : "Logistics"}>
          <InfoGrid items={[
            { label: fr ? "Livraison" : "Delivery task", value: task ? task.status.replace(/_/g, " ") : "—" },
            { label: fr ? "Livreur assigné" : "Rider assigned", value: live.riderId ? (fr ? "Oui" : "Yes") : "—" },
            { label: fr ? "Zone" : "Zone", value: live.zoneId ?? "—" },
            { label: fr ? "COD à encaisser" : "COD to collect", value: task && task.codAmountUsd > 0 ? formatCurrency(task.codAmountUsd, locale) : "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Montants" : "Amounts"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Articles" : "Items", value: formatCurrency(itemsValue, locale) },
            { label: fr ? "Livraison" : "Delivery", value: formatCurrency(live.deliveryFeeUsd, locale) },
            { label: fr ? "Remise campagne" : "Campaign discount", value: formatCurrency(live.campaignDiscountUsd ?? 0, locale) },
            { label: fr ? "Remise code promo" : "Promo discount", value: formatCurrency(live.discountUsd ?? 0, locale) },
            { label: fr ? "Total" : "Total", value: formatCurrency(live.totalUsd, locale) },
            { label: fr ? `Commission${Number.isFinite(commissionPct) ? ` (${commissionPct} %)` : ""}` : `Commission${Number.isFinite(commissionPct) ? ` (${commissionPct}%)` : ""}`, value: commission === null ? "—" : formatCurrency(commission, locale) },
            { label: fr ? "Remboursé" : "Refunded", value: formatCurrency(paymentRefunded ? (payment?.amountUsd ?? 0) : 0, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Détails du produit" : "Product Details"} span={3}>
          <div className="space-y-4">
            {live.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border)] p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/products/${item.productId}`} className="font-medium text-[var(--primary)] hover:underline">{item.productName}</Link>
                  {item.variant && <p className="text-xs text-slate-500">{fr ? "Variante" : "Variant"}: {item.variant}</p>}
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
    </div>
  );
}
