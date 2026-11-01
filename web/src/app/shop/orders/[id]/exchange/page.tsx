"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { PhotoPicker } from "@/components/shop/photo-picker";
import { variantDisplay } from "@/components/shop/order-products";
import { useMyOrder } from "@/lib/orders";
import { useCatalog } from "@/lib/catalog";
import { labeledGroups, pickText } from "@/lib/i18n-fields";
import { variantLabel, missingPick } from "@/lib/variants";
import type { ExchangeRow, ReplacementRow } from "@/lib/after-sale";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";

const CONDITIONS = [
  { value: "Defective", en: "Defective or not working", fr: "Défectueux ou ne fonctionne pas" },
  { value: "Damaged", en: "Damaged on arrival", fr: "Endommagé à la livraison" },
  { value: "Wrong item", en: "Wrong item sent", fr: "Mauvais article envoyé" },
  { value: "Other", en: "Other", fr: "Autre" },
];

function SwapForm() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const rt = useRealtime();
  const { toast } = useToast();
  const order = useMyOrder(id);
  const catalog = useCatalog();
  const [kind, setKind] = useState<"replacement" | "exchange">("replacement");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("Defective");
  const [photos, setPhotos] = useState<string[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const raw = rt.orders.find((o) => o.id === order?.id);
  const lines = useMemo(() => (raw?.items ?? []).filter((i) => i.fulfilment !== "cancelled" && !i.productId.startsWith("ext:")), [raw]);
  const line = lines.find((l) => l.id === itemId) ?? lines[0];
  const product = line ? catalog.find((p) => p.id === line.productId) : undefined;
  const groups = product ? labeledGroups(product.variants, product.variantLabels, fr) : [];
  const canExchange = !!product && groups.length > 0;
  const toVariant = groups.length ? variantLabel(product!.variants, picks) : null;
  const sameOption = !!line && toVariant === line.variant;
  const estDiff = product && line ? Math.round((product.price - line.priceUsd) * qty * 100) / 100 : 0;

  if (!order || !raw) {
    return <div className="text-center text-slate-500">{rt.status === "connected" ? (fr ? "Commande introuvable" : "Order not found") : fr ? "Chargement…" : "Loading…"}</div>;
  }
  if (order.status !== "delivered") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <PageHeader title={fr ? "Remplacer ou échanger" : "Replace or exchange"} backHref={`/shop/orders/${order.id}`} />
        <p className="text-sm text-slate-600">{fr ? "Un remplacement ou un échange peut être demandé une fois la commande livrée." : "A replacement or exchange can be requested once the order has been delivered."}</p>
      </div>
    );
  }

  async function submit() {
    if (!line) return;
    setError(null);
    if (kind === "exchange") {
      const missing = product ? missingPick(product.variants, picks) : null;
      if (missing) {
        setError(fr ? `Choisissez : ${groups.find((g) => g.name === missing.name)?.label ?? missing.name}` : `Choose a ${(groups.find((g) => g.name === missing.name)?.label ?? missing.name).toLowerCase()}`);
        return;
      }
      if (sameOption) {
        setError(fr ? "Choisissez une autre option pour l'échange." : "Choose a different option to exchange for.");
        return;
      }
    }
    setBusy(true);
    try {
      if (kind === "replacement") {
        const r = await socketClient.request<ReplacementRow>("replacements:create", {
          orderId: order!.id,
          sku: line.productId,
          productName: line.productName,
          reason: reason.trim() || undefined,
          condition,
          qty,
          ...(photos.length ? { attachments: photos } : {}),
        });
        toast(fr ? "Demande de remplacement envoyée" : "Replacement requested");
        router.push(`/shop/replacements/${r.id}`);
      } else {
        const r = await socketClient.request<ExchangeRow>("exchanges:create", {
          orderId: order!.id,
          fromSku: line.productId,
          fromName: line.productName,
          toSku: line.productId,
          toName: line.productName,
          toVariant,
          qty,
          reason: reason.trim() || undefined,
        });
        toast(fr ? "Demande d'échange envoyée" : "Exchange requested");
        router.push(`/shop/exchanges/${r.id}`);
      }
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={fr ? "Remplacer ou échanger" : "Replace or exchange"}
        subtitle={fr ? `Commande ${order.reference}` : `Order ${order.reference}`}
        backHref={`/shop/orders/${order.id}`}
        breadcrumbs={[{ label: fr ? "Commandes" : "Orders", href: "/shop/orders" }, { label: order.reference, href: `/shop/orders/${order.id}` }, { label: fr ? "Remplacer / échanger" : "Replace / exchange" }]}
      />

      <div className="card-premium space-y-5 p-6">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={fr ? "Type de demande" : "Request type"}>
          {([
            ["replacement", fr ? "Remplacement" : "Replacement", fr ? "Même article, neuf : le vôtre est défectueux ou abîmé." : "Same item, new unit: yours is faulty or damaged."],
            ["exchange", fr ? "Échange" : "Exchange", fr ? "Une autre taille, couleur ou option du même produit." : "Another size, colour or option of the same product."],
          ] as const).map(([v, label, hint]) => (
            <label key={v} className={`cursor-pointer rounded-xl border p-4 ${kind === v ? "border-blue-500 bg-blue-50" : "border-[var(--border)]"}`}>
              <input type="radio" name="kind" className="sr-only" checked={kind === v} onChange={() => setKind(v)} />
              <p className="font-semibold text-slate-900">{label}</p>
              <p className="mt-0.5 text-xs text-slate-600">{hint}</p>
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="swap-item" className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Article concerné" : "Which item"}</label>
          <select id="swap-item" className="input-premium w-full px-3 py-2 text-sm" value={line?.id ?? ""} onChange={(e) => { setItemId(e.target.value); setQty(1); setPicks({}); }}>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{pickText(fr, l.productName, l.productNameFr)} — {variantDisplay(l.variant, fr ? l.variantFr ?? null : null, fr)} × {l.qty}</option>
            ))}
          </select>
        </div>

        {line && line.qty > 1 && (
          <div>
            <label htmlFor="swap-qty" className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Quantité" : "Quantity"}</label>
            <select id="swap-qty" className="input-premium w-28 px-3 py-2 text-sm" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
              {Array.from({ length: line.qty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}

        {kind === "replacement" ? (
          <>
            <div>
              <label htmlFor="swap-cond" className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Problème" : "What is wrong"}</label>
              <select id="swap-cond" className="input-premium w-full px-3 py-2 text-sm" value={condition} onChange={(e) => setCondition(e.target.value)}>
                {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{fr ? c.fr : c.en}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">{fr ? "Photos (jusqu'à 6)" : "Photos (up to 6)"}</p>
              <PhotoPicker value={photos} onChange={setPhotos} max={6} fr={fr} />
            </div>
          </>
        ) : !canExchange ? (
          <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {fr ? "Ce produit n'a pas d'autre option (taille, couleur…) : demandez plutôt un remplacement ou un retour." : "This product has no other option (size, colour…): ask for a replacement or a return instead."}
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.name} data-testid={`swap-variant-${g.name}`}>
                <p className="mb-1.5 text-sm font-medium text-slate-700">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o) => {
                    const on = picks[g.name] === o.value;
                    return (
                      <button key={o.value} type="button" aria-pressed={on} onClick={() => setPicks((c) => ({ ...c, [g.name]: o.value }))} className={`min-w-11 rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-slate-300 text-slate-700 hover:border-[var(--primary)]"}`}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {line && product && (
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600" data-testid="swap-diff">
                {fr ? "Différence de prix estimée" : "Estimated price difference"}:{" "}
                <strong>{estDiff === 0 ? (fr ? "aucune" : "none") : estDiff > 0 ? `+${formatCurrency(estDiff, locale)}` : `-${formatCurrency(-estDiff, locale)}`}</strong>.{" "}
                {estDiff > 0
                  ? fr ? `Ce montant est retenu sur votre portefeuille (solde : ${formatCurrency(rt.walletBalance, locale)}) dès la demande ; il est rendu si l'échange est refusé.` : `This amount is held from your wallet (balance: ${formatCurrency(rt.walletBalance, locale)}) when you ask, and returned if the exchange is declined.`
                  : estDiff < 0
                    ? fr ? "La différence est remboursée sur votre portefeuille à la livraison." : "The difference is refunded to your wallet on delivery."
                    : fr ? "Le montant exact est calculé par le serveur." : "The exact amount is worked out by the server."}
              </p>
            )}
            {sameOption && Object.keys(picks).length > 0 && <p className="text-xs text-amber-800">{fr ? "C'est l'option que vous avez déjà." : "That is the option you already have."}</p>}
          </div>
        )}

        <div>
          <label htmlFor="swap-reason" className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Précisions (facultatif)" : "Details (optional)"}</label>
          <textarea id="swap-reason" className="input-premium w-full px-3 py-2 text-sm" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button onClick={submit} disabled={busy || !line || (kind === "exchange" && !canExchange)} className="w-full">
          {busy ? "…" : kind === "replacement" ? (fr ? "Demander un remplacement" : "Request a replacement") : fr ? "Demander un échange" : "Request an exchange"}
        </Button>
        <p className="text-center text-xs text-slate-500">
          <Link href={`/shop/orders/${order.id}/return`} className="text-[var(--primary)] hover:underline">{fr ? "Vous préférez être remboursé ? Demandez un retour" : "Rather get a refund? Request a return"}</Link>
        </p>
      </div>
    </div>
  );
}

export default function ShopOrderExchangePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/orders/${id}/exchange`}>
      <SwapForm />
    </RequireSignIn>
  );
}
