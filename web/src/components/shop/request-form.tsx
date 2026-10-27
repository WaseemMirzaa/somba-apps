"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PhotoPicker } from "@/components/shop/photo-picker";
import { variantDisplay } from "@/components/shop/order-products";
import { useMyOrder } from "@/lib/orders";
import { DISPUTE_CATEGORIES, RETURN_CATEGORIES, stageText } from "@/lib/after-sale";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { usePublicSettings } from "@/lib/shop-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import type { Dispute } from "@/lib/realtime/types";

interface EligibleItem {
  itemId: string;
  productId: string;
  productName: string;
  variant: string | null;
  qty: number;
  remaining: number;
  unitPriceUsd: number;
}
interface Eligibility {
  eligible: boolean;
  reason: string | null;
  windowDays: number;
  deliveredAt: string | null;
  endsAt: string | null;
  items: EligibleItem[];
}

/**
 * Return (items + quantities + photos, refund to wallet or phone) and dispute (missing / damaged / wrong item /
 * not received) share one three-step form. Server rules (window, quantities) are enforced by `disputes:open`;
 * the form shows the same limits first so nobody hits them blind.
 */
export function RequestForm({ orderId, mode }: { orderId: string; mode: "return" | "dispute" }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const rt = useRealtime();
  const settings = usePublicSettings();
  const order = useMyOrder(orderId);
  const raw = rt.orders.find((o) => o.id === order?.id);
  const isReturn = mode === "return";

  const [elig, setElig] = useState<Eligibility | null>(null);
  const [eligError, setEligError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [refundTo, setRefundTo] = useState<"wallet" | "phone">("wallet");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(Dispute & { siblings?: string[] }) | null>(null);

  const orderUuid = order?.id;
  useEffect(() => {
    if (!isReturn || !orderUuid || rt.status !== "connected") return;
    let alive = true;
    socketClient
      .request<Eligibility>("disputes:eligibility", { orderId: orderUuid })
      .then((e) => alive && setElig(e))
      .catch((e: Error) => alive && setEligError(e.message));
    return () => {
      alive = false;
    };
  }, [isReturn, orderUuid, rt.status]);

  // Items that can still be asked about: from the server for a return, from the order for a dispute.
  const items: EligibleItem[] = useMemo(() => {
    if (isReturn) return elig?.items ?? [];
    return (raw?.items ?? [])
      .filter((i) => i.fulfilment !== "cancelled")
      .map((i) => ({ itemId: i.id, productId: i.productId, productName: i.productName, variant: i.variant, qty: i.qty, remaining: i.qty, unitPriceUsd: i.priceUsd }));
  }, [isReturn, elig, raw]);

  const chosen = items.filter((i) => (qty[i.itemId] ?? 0) > 0);
  const categories = isReturn ? RETURN_CATEGORIES : DISPUTE_CATEGORIES;
  const refundEstimate = chosen.reduce((s, i) => s + i.unitPriceUsd * (qty[i.itemId] ?? 0), 0);

  if (!order) {
    return <div className="text-center text-slate-500">{rt.status === "connected" ? (fr ? "Commande introuvable" : "Order not found") : fr ? "Chargement…" : "Loading…"}</div>;
  }

  const title = isReturn ? (fr ? "Demander un retour" : "Request a return") : fr ? "Signaler un problème" : "Report a problem";
  const back = `/shop/orders/${order.id}`;

  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="card-premium p-10" data-testid="request-result">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-2xl">✓</div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
            {isReturn ? (fr ? "Demande de retour enregistrée" : "Return request submitted") : fr ? "Problème signalé" : "Problem reported"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{fr ? "Référence" : "Reference"}: <strong>{result.reference}</strong></p>
          <p className="mt-1 text-sm text-slate-500">{stageText(result, fr)}</p>
          <p className="mt-3 text-xs text-slate-500">
            {isReturn
              ? fr
                ? `Le vendeur a ${settings.sellerResponseHours} h pour répondre. S'il refuse ou ne répond pas, vous pourrez demander l'avis du support Somba.`
                : `The seller has ${settings.sellerResponseHours} h to answer. If they decline or stay silent, you can ask Somba support to review.`
              : fr
                ? "Le vendeur peut répondre dans la discussion ; le support Somba décide ensuite."
                : "The seller can reply in the thread; Somba support then decides."}
          </p>
          {result.siblings && result.siblings.length > 0 && (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {fr
                ? `Votre commande vient de plusieurs boutiques : ${result.siblings.length + 1} demandes ont été créées (une par boutique).`
                : `Your order has items from several stores: ${result.siblings.length + 1} requests were created (one per store).`}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href={`/shop/returns/${result.id}`} className="btn-primary px-5 py-2.5 text-sm">{fr ? "Suivre cette demande" : "Track this request"}</Link>
            <Link href={back} className="rounded-xl border px-5 py-2.5 text-sm font-medium">{fr ? "← Retour à la commande" : "← Back to order"}</Link>
          </div>
        </div>
      </div>
    );
  }

  if (isReturn && order.status !== "delivered") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <PageHeader title={title} backHref={back} />
        <p className="text-sm text-slate-600">{fr ? "Un retour peut être demandé une fois la commande livrée." : "A return can be requested once the order has been delivered."}</p>
        <Link href={`/shop/orders/${order.id}/dispute`} className="text-[var(--primary)] hover:underline">{fr ? "Un problème avec cette commande ? Signalez-le" : "Problem with this order? Report it"}</Link>
      </div>
    );
  }

  if (isReturn && elig && !elig.eligible) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <PageHeader title={title} backHref={back} />
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{elig.reason ?? (fr ? "Ce retour n'est pas possible." : "This return is not possible.")}</p>
        <Link href={`/shop/orders/${order.id}/dispute`} className="text-[var(--primary)] hover:underline">{fr ? "Signaler un problème à la place" : "Report a problem instead"}</Link>
      </div>
    );
  }

  function setItemQty(it: EligibleItem, n: number) {
    setQty((cur) => ({ ...cur, [it.itemId]: Math.max(0, Math.min(it.remaining, n)) }));
  }

  const itemsOk = isReturn ? chosen.length > 0 : true;
  const reasonOk = reason.trim().length >= 5;

  async function submit() {
    setError(null);
    if (isReturn && chosen.length === 0) {
      setError(fr ? "Choisissez au moins un article à retourner." : "Choose at least one item to return.");
      return;
    }
    setSubmitting(true);
    try {
      const d = await socketClient.request<Dispute & { siblings?: string[] }>("disputes:open", {
        orderId: order!.id,
        type: mode,
        reason: reason.trim(),
        ...(category ? { category } : {}),
        ...(chosen.length ? { items: chosen.map((i) => ({ itemId: i.itemId, qty: qty[i.itemId] })) } : {}),
        ...(photos.length ? { attachments: photos } : {}),
        ...(isReturn ? { refundTo } : {}),
      });
      setResult(d);
      toast(isReturn ? (fr ? "Demande de retour envoyée" : "Return request sent") : fr ? "Problème signalé" : "Problem reported");
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
        title={title}
        subtitle={fr ? `Commande ${order.reference}` : `Order ${order.reference}`}
        backHref={back}
        breadcrumbs={[
          { label: fr ? "Commandes" : "Orders", href: "/shop/orders" },
          { label: order.reference, href: back },
          { label: isReturn ? (fr ? "Retour" : "Return") : fr ? "Problème" : "Problem" },
        ]}
      />

      {isReturn && elig && elig.endsAt && (
        <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
          {fr
            ? `Retours acceptés dans les ${elig.windowDays} jours suivant la livraison — jusqu'au ${new Date(elig.endsAt).toLocaleDateString("fr-FR")}.`
            : `Returns are accepted within ${elig.windowDays} days of delivery — until ${new Date(elig.endsAt).toLocaleDateString("en-GB")}.`}
        </p>
      )}
      {eligError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{eligError}</p>}

      <div className="flex gap-2" aria-hidden="true">
        {[1, 2, 3].map((s) => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-[var(--primary)]" : "bg-slate-200"}`} />)}
      </div>

      {step === 1 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">
            {isReturn ? (fr ? "Quels articles retournez-vous ?" : "Which items are you returning?") : fr ? "Quels articles sont concernés ? (facultatif)" : "Which items are affected? (optional)"}
          </h3>
          {!isReturn && <p className="text-xs text-slate-500">{fr ? "Ne choisissez rien si le problème concerne toute la commande." : "Choose nothing if the problem is with the whole order."}</p>}
          {items.length === 0 && <p className="text-sm text-slate-500">{isReturn && !elig ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucun article disponible." : "No items available."}</p>}
          {items.map((it) => {
            const n = qty[it.itemId] ?? 0;
            const line = order.items.find((o) => o.productId === it.productId);
            return (
              <div key={it.itemId} className={`flex items-center gap-4 rounded-xl border p-4 ${n > 0 ? "border-blue-400 bg-blue-50/40" : "border-[var(--border)]"}`} data-testid="request-item">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{fr && line?.nameFr ? line.nameFr : it.productName}</p>
                  <p className="text-xs text-slate-500">
                    {variantDisplay(it.variant ?? "Default", fr ? line?.variantFr ?? null : null, fr)} · {formatCurrency(it.unitPriceUsd, locale)}
                    {" · "}{fr ? `${it.remaining} sur ${it.qty} disponible(s)` : `${it.remaining} of ${it.qty} available`}
                  </p>
                </div>
                {it.remaining > 0 ? (
                  <div className="flex items-center gap-2" role="group" aria-label={fr ? "Quantité à signaler" : "Quantity"}>
                    <button type="button" onClick={() => setItemQty(it, n - 1)} disabled={n <= 0} aria-label={fr ? "Moins" : "Less"} className="h-8 w-8 rounded-lg border text-lg leading-none disabled:opacity-40">−</button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums" data-testid="request-qty">{n}</span>
                    <button type="button" onClick={() => setItemQty(it, n + 1)} disabled={n >= it.remaining} aria-label={fr ? "Plus" : "More"} className="h-8 w-8 rounded-lg border text-lg leading-none disabled:opacity-40">+</button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">{fr ? "Déjà demandé" : "Already requested"}</span>
                )}
              </div>
            );
          })}
          <Button onClick={() => setStep(2)} disabled={!itemsOk} className="w-full">{fr ? "Continuer" : "Continue"}</Button>
        </div>
      )}

      {step === 2 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">{isReturn ? (fr ? "Pourquoi retournez-vous ?" : "Why are you returning?") : fr ? "Quel est le problème ?" : "What went wrong?"}</h3>
          <div className="space-y-2" role="radiogroup">
            {categories.map((c) => (
              <label key={c.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] p-3 hover:border-blue-200">
                <input type="radio" name="category" value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} className="h-4 w-4 text-[var(--primary)]" />
                <span className="text-sm text-slate-700">{fr ? c.label.fr : c.label.en}</span>
              </label>
            ))}
          </div>
          <div>
            <label htmlFor="reason" className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Décrivez la situation" : "Describe what happened"}</label>
            <textarea id="reason" className="input-premium w-full px-4 py-3 text-sm" rows={4} maxLength={1000} placeholder={fr ? "Au moins quelques mots…" : "A few words at least…"} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">{fr ? "Photos (jusqu'à 6)" : "Photos (up to 6)"}</p>
            <PhotoPicker value={photos} onChange={setPhotos} max={6} fr={fr} />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">{fr ? "Retour" : "Back"}</Button>
            <Button onClick={() => setStep(3)} disabled={!category || !reasonOk} className="flex-1">{fr ? "Continuer" : "Continue"}</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">{fr ? "Vérifiez et envoyez" : "Review and send"}</h3>
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong>{fr ? "Commande" : "Order"}:</strong> {order.reference}</p>
            <p>
              <strong>{fr ? "Articles" : "Items"}:</strong>{" "}
              {chosen.length ? chosen.map((i) => `${i.productName} × ${qty[i.itemId]}`).join(", ") : fr ? "Toute la commande" : "The whole order"}
            </p>
            <p><strong>{fr ? "Motif" : "Reason"}:</strong> {categories.find((c) => c.value === category) ? (fr ? categories.find((c) => c.value === category)!.label.fr : categories.find((c) => c.value === category)!.label.en) : category}</p>
            <p className="mt-1 whitespace-pre-line">{reason}</p>
            {photos.length > 0 && <p className="mt-1">{fr ? `${photos.length} photo(s) jointe(s)` : `${photos.length} photo(s) attached`}</p>}
            {isReturn && <p className="mt-2"><strong>{fr ? "Remboursement estimé" : "Estimated refund"}:</strong> {formatCurrency(refundEstimate, locale)}</p>}
          </div>
          {isReturn && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">{fr ? "Rembourser vers" : "Refund to"}</legend>
              {([["wallet", fr ? "Mon portefeuille Somba (immédiat)" : "My Somba wallet (instant)"], ["phone", fr ? "Mon téléphone Mobile Money" : "My mobile-money phone"]] as const).map(([v, label]) => (
                <label key={v} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-sm">
                  <input type="radio" name="refundTo" checked={refundTo === v} onChange={() => setRefundTo(v)} />
                  {label}
                </label>
              ))}
              <p className="text-xs text-slate-500">{fr ? "Si le remboursement sur le téléphone n'est pas possible pour ce paiement, il ira dans votre portefeuille." : "If a refund to the phone isn't possible for this payment, it goes to your wallet."}</p>
            </fieldset>
          )}
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex-1" disabled={submitting}>{fr ? "Retour" : "Back"}</Button>
            <Button onClick={submit} className="flex-1" disabled={submitting}>{submitting ? "…" : isReturn ? (fr ? "Envoyer la demande de retour" : "Submit return") : fr ? "Envoyer" : "Submit"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
