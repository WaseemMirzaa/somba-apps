"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyOrder, disputeStageLabel, type DisputeRow } from "@/lib/orders";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatPaymentMethod } from "@/lib/utils";

const reasons = [
  { en: "Defective or damaged item", fr: "Article défectueux ou endommagé" },
  { en: "Wrong item received", fr: "Mauvais article reçu" },
  { en: "Item not as described", fr: "Article non conforme à la description" },
  { en: "Changed my mind", fr: "J'ai changé d'avis" },
  { en: "Other", fr: "Autre" },
];

function ReturnWizard() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DisputeRow | null>(null);
  const order = useMyOrder(id);

  if (!order) {
    return <div className="text-center text-slate-500">{fr ? "Commande introuvable" : "Order not found"}</div>;
  }

  const isPicked = (sku: string) => picked[sku] !== false; // all items selected by default
  const selected = order.items.filter((i) => isPicked(i.sku));

  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="card-premium p-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-2xl">✓</div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
            {fr ? "Demande de retour enregistrée" : "Return request submitted"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {fr ? "Référence" : "Reference"}: <strong>{result.reference}</strong>
          </p>
          <p className="mt-1 text-sm text-slate-500">{disputeStageLabel(result, fr)}</p>
          <p className="mt-3 text-xs text-slate-500">
            {fr
              ? "Notre équipe examine votre demande. Le statut se met à jour ici en direct."
              : "Our team will review your request. The status updates live on the returns page."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href={`/shop/returns/${result.id}`} className="btn-primary px-5 py-2.5 text-sm">{fr ? "Suivre ce retour" : "Track this return"}</Link>
            <Link href={`/shop/orders/${order.id}`} className="rounded-xl border px-5 py-2.5 text-sm font-medium">{fr ? "← Retour à la commande" : "← Back to order"}</Link>
          </div>
        </div>
      </div>
    );
  }

  if (order.status !== "delivered") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <PageHeader title={t("startReturn")} backHref={`/shop/orders/${order.id}`} />
        <p className="text-sm text-slate-600">
          {fr ? "Un retour peut être demandé une fois la commande livrée." : "A return can be requested once the order has been delivered."}
        </p>
        <Link href={`/shop/orders/${order.id}`} className="text-[var(--primary)] hover:underline">{fr ? "← Retour à la commande" : "← Back to order"}</Link>
      </div>
    );
  }

  async function submit() {
    if (!order) return;
    setError(null);
    const reasonLabel = reasons.find((r) => r.en === reason)?.en ?? reason;
    const itemsText = selected.map((i) => `${i.name} x${i.qty}`).join("; ");
    const full = `${reasonLabel}. Items: ${itemsText}.${details.trim() ? ` Details: ${details.trim()}` : ""}`;
    setSubmitting(true);
    try {
      const dispute = await socketClient.request<DisputeRow>("disputes:open", { orderId: order.id, type: "return", reason: full });
      setResult(dispute);
      toast(fr ? "Demande de retour envoyée" : "Return request sent");
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title={t("startReturn")}
        subtitle={fr ? `Commande ${order.reference}` : `Order ${order.reference}`}
        backHref={`/shop/orders/${order.id}`}
        breadcrumbs={[
          { label: fr ? "Commandes" : "Orders", href: "/shop/orders" },
          { label: order.reference, href: `/shop/orders/${order.id}` },
          { label: t("returns") },
        ]}
      />

      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-[var(--primary)]" : "bg-slate-200"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">{fr ? "Sélectionnez les articles à retourner" : "Select items to return"}</h3>
          {order.items.map((item) => (
            <label key={item.sku} className="flex cursor-pointer items-center gap-4 rounded-xl border border-[var(--border)] p-4 hover:border-blue-200">
              <input
                type="checkbox"
                checked={isPicked(item.sku)}
                onChange={(e) => setPicked((p) => ({ ...p, [item.sku]: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
              />
              <div className="flex-1">
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">{fr ? "Qté" : "Qty"}: {item.qty}</p>
              </div>
            </label>
          ))}
          <Button onClick={() => setStep(2)} disabled={selected.length === 0} className="w-full">{fr ? "Continuer" : "Continue"}</Button>
        </div>
      )}

      {step === 2 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">{t("returnReason")}</h3>
          {reasons.map((r) => (
            <label key={r.en} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] p-4 hover:border-blue-200">
              <input type="radio" name="reason" value={r.en} checked={reason === r.en} onChange={() => setReason(r.en)} className="h-4 w-4 text-[var(--primary)]" />
              <span className="text-sm text-slate-700">{fr ? r.fr : r.en}</span>
            </label>
          ))}
          <textarea
            className="input-premium w-full px-4 py-3 text-sm"
            rows={3}
            placeholder={fr ? "Détails (facultatif)" : "Details (optional)"}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">{fr ? "Retour" : "Back"}</Button>
            <Button onClick={() => setStep(3)} disabled={!reason} className="flex-1">{fr ? "Continuer" : "Continue"}</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">{fr ? "Confirmer le retour" : "Confirm return"}</h3>
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong>{fr ? "Commande" : "Order"}:</strong> {order.reference}</p>
            <p><strong>{fr ? "Articles" : "Items"}:</strong> {selected.map((i) => `${i.name} x${i.qty}`).join(", ")}</p>
            <p><strong>{fr ? "Motif" : "Reason"}:</strong> {fr ? (reasons.find((r) => r.en === reason)?.fr ?? reason) : reason}</p>
            <p><strong>{fr ? "Mode de remboursement" : "Refund method"}:</strong> {fr ? "Paiement d'origine" : "Original payment"} ({fr && order.paymentMethod === "Card" ? "Carte" : formatPaymentMethod(order.paymentMethod, locale)})</p>
            <p className="mt-2 text-xs text-slate-500">{fr ? "Adresse" : "Address"}: {order.customerAddress}</p>
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex-1" disabled={submitting}>{fr ? "Retour" : "Back"}</Button>
            <Button onClick={submit} className="flex-1" disabled={submitting}>{submitting ? "…" : t("submitReturn")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShopOrderReturnPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/orders/${id}/return`}>
      <ReturnWizard />
    </RequireSignIn>
  );
}
