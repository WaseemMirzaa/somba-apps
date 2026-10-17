"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { paymentMethodLabel } from "@/lib/seller-labels";
import type { PlanPayment } from "@/lib/seller";

/**
 * "Approve the request on your phone" for a seller-plan payment. Same flow and
 * wording as the shop's `PaymentPending` (components/shop/payment-pending.tsx),
 * but keyed on a plan payment instead of an order: it updates live from the
 * `payment:updated` push the realtime context already receives, asks the server
 * once after a reconnect (a push may have been missed), and never claims success
 * until the payment says `succeeded`.
 */
export function PlanPaymentPending({
  payment,
  planName,
  activated,
  onRetry,
}: {
  payment: PlanPayment;
  planName: string;
  /** True once the store row says the plan is in force (arrives via `seller:updated`). */
  activated: boolean;
  /** The payment failed: go back to the form. */
  onRetry: () => void;
}) {
  const rt = useRealtime();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [slow, setSlow] = useState(false);

  const live = useMemo(
    () => (rt.payments.find((p) => p.id === payment.id) as PlanPayment | undefined) ?? payment,
    [rt.payments, payment],
  );

  useEffect(() => {
    if (rt.status !== "connected" || live.status !== "pending") return;
    socketClient.request<PlanPayment>("payments:status", { reference: live.reference }).catch(() => {
      /* the live pushes remain the source of truth */
    });
  }, [rt.status, live.reference, live.status]);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 90_000);
    return () => clearTimeout(t);
  }, []);

  const method = paymentMethodLabel(live.method, fr);

  if (live.status === "failed") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8 text-center" role="alert" data-testid="plan-payment-failed">
        <XCircle className="mx-auto h-16 w-16 text-red-500" />
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
          {fr ? "Paiement non abouti" : "Payment did not go through"}
        </h2>
        <p className="text-sm text-slate-600">
          {live.failureReason || (fr ? "La demande de paiement n'a pas été approuvée." : "The payment request was not approved.")}
        </p>
        <p className="text-xs text-slate-500">{fr ? "Aucun montant n'a été débité." : "You have not been charged."}</p>
        <Button onClick={onRetry}>{fr ? "Réessayer" : "Try again"}</Button>
      </div>
    );
  }

  if (live.status === "succeeded" || activated) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-8 text-center" data-testid="plan-activated">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
          {fr ? `Offre ${planName} activée` : `${planName} plan activated`}
        </h2>
        {!activated && <p className="text-sm text-slate-600">{fr ? "Paiement confirmé, activation en cours…" : "Payment confirmed, activating…"}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 py-8 text-center" data-testid="plan-payment-pending">
      <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-blue-50">
        <Smartphone className="h-8 w-8 text-[var(--primary)]" />
      </div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
        {fr ? "Approuvez la demande sur votre téléphone" : "Approve the request on your phone"}
      </h2>
      <p className="text-sm text-slate-600">
        {fr
          ? `Nous avons envoyé une demande ${method} de ${live.amountUsd.toFixed(2)} $. Saisissez votre code PIN sur votre téléphone pour activer l'offre ${planName}.`
          : `We sent a ${method} request for $${live.amountUsd.toFixed(2)}. Enter your PIN on your phone to activate the ${planName} plan.`}
      </p>
      <p className="text-xs text-slate-500" role="status">
        {fr ? "Cette page se met à jour automatiquement." : "This page updates automatically."}
      </p>
      {slow && (
        <p className="text-xs text-amber-700">
          {fr
            ? "Toujours en attente ? Vous pouvez quitter cette page : l'offre s'activera dès que le paiement est confirmé."
            : "Still waiting? You can leave this page: the plan activates as soon as the payment is confirmed."}
        </p>
      )}
    </div>
  );
}
