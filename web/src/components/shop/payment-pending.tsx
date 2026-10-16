"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Smartphone, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { paymentMethodName } from "@/lib/shop-live";
import type { Order, Payment } from "@/lib/realtime/types";

type PaymentWithReason = Payment & { failureReason?: string | null };

/**
 * "Approve the request on your phone" screen for mobile-money orders.
 * Updates live from the `order:updated` / `payment:updated` pushes the realtime
 * context already receives. Never shows success until the server says so.
 */
export function PaymentPending({
  order,
  onConfirmed,
  onRestoreCart,
}: {
  order: Order;
  /** Called once when the order has left `pending` successfully. */
  onConfirmed: (order: Order) => void;
  /** Called when the customer wants the items back in the cart after a failure. */
  onRestoreCart: () => void;
}) {
  const rt = useRealtime();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [cancelling, setCancelling] = useState(false);
  const [slow, setSlow] = useState(false);

  const live = useMemo(() => rt.orders.find((o) => o.id === order.id) ?? order, [rt.orders, order]);
  const payment = useMemo(
    () => rt.payments.find((p) => p.orderId === order.id) as PaymentWithReason | undefined,
    [rt.payments, order.id],
  );

  const failed = live.status === "cancelled" || payment?.status === "failed";
  const confirmed = !failed && live.status !== "pending";

  useEffect(() => {
    if (confirmed) onConfirmed(live);
  }, [confirmed, live, onConfirmed]);

  // After a reconnect the push may have been missed: ask the server once.
  useEffect(() => {
    if (rt.status !== "connected" || !payment?.reference || payment.status !== "pending") return;
    socketClient.request<Payment>("payments:status", { reference: payment.reference }).catch(() => {
      /* the live pushes remain the source of truth */
    });
  }, [rt.status, payment?.reference, payment?.status]);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 90_000);
    return () => clearTimeout(t);
  }, []);

  async function cancel() {
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

  const methodName = paymentMethodName(live.paymentMethod, fr);

  if (failed) {
    const reason = payment?.status === "failed" ? payment.failureReason : null;
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8 text-center" role="alert">
        <XCircle className="mx-auto h-16 w-16 text-red-500" />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
          {fr ? "Paiement non abouti" : "Payment did not go through"}
        </h1>
        <p className="text-sm text-slate-600">
          {reason || (fr ? "La demande de paiement n'a pas été approuvée." : "The payment request was not approved.")}
        </p>
        <p className="text-xs text-slate-500">
          {fr ? "Commande" : "Order"} {live.reference} — {fr ? "aucun montant n'a été débité." : "you have not been charged."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onRestoreCart}>{fr ? "Remettre les articles au panier" : "Put the items back in my cart"}</Button>
          <Link href="/shop/orders" className="rounded-xl border px-5 py-2.5 text-sm font-medium">
            {fr ? "Mes commandes" : "My orders"}
          </Link>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-8 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
        <p className="text-sm text-slate-600">{fr ? "Paiement confirmé…" : "Payment confirmed…"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 py-8 text-center">
      <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-blue-50">
        <Smartphone className="h-8 w-8 text-[var(--primary)]" />
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
        {fr ? "Approuvez la demande sur votre téléphone" : "Approve the request on your phone"}
      </h1>
      <p className="text-sm text-slate-600">
        {fr
          ? `Nous avons envoyé une demande ${methodName} de ${live.totalUsd.toFixed(2)} $. Saisissez votre code PIN sur votre téléphone pour confirmer la commande ${live.reference}.`
          : `We sent a ${methodName} request for $${live.totalUsd.toFixed(2)}. Enter your PIN on your phone to confirm order ${live.reference}.`}
      </p>
      <p className="text-xs text-slate-500" role="status">
        {fr ? "Cette page se met à jour automatiquement." : "This page updates automatically."}
      </p>
      {slow && (
        <p className="text-xs text-amber-700">
          {fr
            ? "Toujours en attente ? Vous pouvez annuler et essayer un autre moyen de paiement."
            : "Still waiting? You can cancel and try another payment method."}
        </p>
      )}
      <Button variant="secondary" onClick={cancel} disabled={cancelling}>
        {cancelling ? "…" : fr ? "Annuler la commande" : "Cancel order"}
      </Button>
    </div>
  );
}
