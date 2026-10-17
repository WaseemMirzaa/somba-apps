"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Smartphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { PlanPaymentPending } from "@/components/seller/plan-payment-pending";
import { formatDate, planName } from "@/components/seller/plan-summary";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { PlanPayment, SellerPlanInfo, SellerStore, SubscribeResult } from "@/lib/seller";
import { errMessage, paymentMethodLabel } from "@/lib/seller-labels";
import { cn, formatCurrency } from "@/lib/utils";

const MOBILE_METHODS = ["airtel_money", "orange_money", "vodacom_mpesa"] as const;
type Method = "wallet" | (typeof MOBILE_METHODS)[number];

const SALES_MAIL = "mailto:sales@somba.com?subject=Somba%20seller%20plan";

/** Plans that can be bought online (a price above zero). */
const buyable = (p: SellerPlanInfo) => p.priceUsd !== null && p.priceUsd > 0;

type Store = (SellerStore & { activePlan?: string }) | null;

/**
 * Buy a seller plan. Works on the public /sell-online/subscribe page and inside
 * the portal (/seller/subscribe): plans come from `sellers:plans`, the purchase
 * is `sellers:subscribe {plan, method, phone}`. Wallet = active at once; mobile
 * money = a pending payment the customer approves on their phone, activation
 * arrives through the `seller:updated` / `payment:updated` pushes.
 */
export function PlanCheckout({ preselect, signInHref = "/login" }: { preselect?: string | null; signInHref?: string }) {
  const rt = useRealtime();
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const connected = rt.status === "connected";
  const isSeller = rt.user?.role === "seller";

  const [plans, setPlans] = useState<SellerPlanInfo[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [store, setStore] = useState<Store | undefined>(undefined);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(preselect ?? null);
  const [method, setMethod] = useState<Method>("airtel_money");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubscribeResult | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setPlansError(null);
    try {
      setPlans(await socketClient.request<SellerPlanInfo[]>("sellers:plans"));
    } catch (e) {
      setPlansError(errMessage(e));
    }
  }, []);
  const loadStore = useCallback(async () => {
    setStoreError(null);
    try {
      setStore(await socketClient.request<Store>("sellers:mine"));
    } catch (e) {
      setStoreError(errMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!connected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server reads (and again after a reconnect)
    void loadPlans();
    if (isSeller) void loadStore();
    else setStore(null);
  }, [connected, isSeller, loadPlans, loadStore]);

  // The plan becoming active arrives as a push on the store row.
  useEffect(() => {
    if (!connected || !isSeller) return;
    const s = socketClient.current;
    if (!s) return;
    const onSeller = (x: SellerStore & { activePlan?: string }) => {
      if (x.userId === rt.user?.id) setStore((cur) => ({ ...(cur ?? ({} as SellerStore)), ...x }));
    };
    s.on("seller:updated", onSeller);
    return () => {
      s.off("seller:updated", onSeller);
    };
  }, [connected, isSeller, rt.user?.id]);

  const paid = useMemo(() => (plans ?? []).filter(buyable), [plans]);
  const chosen = useMemo(() => {
    const byId = (plans ?? []).find((p) => p.id === selected && buyable(p));
    return byId ?? paid.find((p) => p.popular) ?? paid[0] ?? null;
  }, [plans, selected, paid]);

  const activePlan = store?.activePlan ?? store?.plan ?? "free";
  const expiresAt = activePlan !== "free" ? (store?.planExpiresAt ?? null) : null;

  // A mobile-money plan payment that is still waiting (e.g. the page was reloaded): resume it.
  const waiting = useMemo(
    () => (rt.payments as PlanPayment[]).find((p) => p.purpose === "plan" && p.status === "pending") ?? null,
    [rt.payments],
  );
  const pendingPayment = result?.payment ?? (resumeId ? (rt.payments as PlanPayment[]).find((p) => p.id === resumeId) : null) ?? waiting;
  const pendingPlan = (plans ?? []).find((p) => p.id === (pendingPayment?.subject ?? result?.plan.id)) ?? result?.plan ?? null;
  const activated =
    !!pendingPayment && !!store && (store.activePlan ?? store.plan) === pendingPayment.subject && pendingPayment.subject !== "free" && pendingPayment.status !== "pending";

  const phoneOk = method === "wallet" || /^\+?[0-9]{9,15}$/.test(phone.replace(/[\s().-]/g, ""));
  const storeUsable = !!store && store.status !== "rejected" && store.status !== "suspended";

  async function pay() {
    if (!chosen || busy || !phoneOk) return;
    setBusy(true);
    setError(null);
    try {
      const res = await socketClient.request<SubscribeResult>("sellers:subscribe", {
        plan: chosen.id,
        method,
        ...(method === "wallet" ? {} : { phone: phone.trim() }),
      });
      setResult(res);
      setStore((cur) => ({ ...(cur ?? ({} as SellerStore)), ...res.seller }));
      if (res.status === "active") toast(fr ? "Offre activée" : "Plan activated");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  // ── States before the form ────────────────────────────────────────────────
  if (plansError) return <LoadError message={plansError} onRetry={loadPlans} />;
  if (!connected || plans === null) return <SectionLoader />;

  const planCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="plan-cards">
      {plans.map((p) => {
        const isCurrent = activePlan === p.id && !!store;
        const canBuy = buyable(p);
        const features = (fr ? p.featuresFr : undefined) ?? p.features;
        return (
          <div
            key={p.id}
            data-testid={`plan-${p.id}`}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-white p-5",
              chosen?.id === p.id && canBuy ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/20" : "border-[var(--border)]",
            )}
          >
            {p.popular && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-bold text-white">{fr ? "Populaire" : "Popular"}</span>
            )}
            <h3 className="font-bold text-slate-900">{planName(p, p.id, fr)}</h3>
            <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-extrabold text-slate-900">
              {p.priceUsd === null ? (fr ? "Sur mesure" : "Custom") : p.priceUsd === 0 ? (fr ? "Gratuit" : "Free") : formatCurrency(p.priceUsd, locale)}
              {canBuy && <span className="text-sm font-medium text-slate-500"> / {p.months === 1 ? (fr ? "mois" : "month") : fr ? `${p.months} mois` : `${p.months} months`}</span>}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-600">
              {p.maxProducts ? (fr ? `Jusqu'à ${p.maxProducts} annonces` : `Up to ${p.maxProducts} listings`) : fr ? "Annonces illimitées" : "Unlimited listings"}
            </p>
            <ul className="mt-3 flex-1 space-y-1.5">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                  {f}
                </li>
              ))}
            </ul>
            {isCurrent && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-2 py-1 text-center text-xs font-semibold text-emerald-700">
                {expiresAt ? (fr ? `Offre actuelle · jusqu'au ${formatDate(expiresAt, fr)}` : `Current plan · until ${formatDate(expiresAt, fr)}`) : fr ? "Offre actuelle" : "Current plan"}
              </p>
            )}
            {p.priceUsd === null ? (
              <a href={SALES_MAIL} className="mt-3 rounded-lg border border-slate-200 py-2 text-center text-sm font-semibold hover:bg-slate-50">
                {fr ? "Contacter les ventes" : "Contact sales"}
              </a>
            ) : canBuy ? (
              <button
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn("mt-3 rounded-lg py-2 text-sm font-semibold", chosen?.id === p.id ? "btn-primary text-white" : "border border-slate-200 hover:bg-slate-50")}
              >
                {chosen?.id === p.id ? (fr ? "Choisie" : "Selected") : fr ? "Choisir" : "Choose"}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  // ── Not a seller yet ──────────────────────────────────────────────────────
  if (!rt.user || !isSeller) {
    return (
      <div className="space-y-6">
        {planCards}
        <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-[var(--border)] bg-white p-6 text-center" data-testid="subscribe-needs-seller">
          <h2 className="font-semibold text-slate-900">
            {rt.user ? (fr ? "Il vous faut un compte vendeur" : "You need a seller account") : fr ? "Connectez-vous pour vous abonner" : "Sign in to subscribe"}
          </h2>
          <p className="text-sm text-slate-600">
            {rt.user
              ? fr ? "Vous êtes connecté avec un compte qui n'est pas un compte vendeur. Connectez-vous avec votre compte vendeur ou ouvrez une boutique." : "You are signed in with an account that is not a seller account. Sign in with your seller account or open a store."
              : fr ? "Un abonnement s'attache à votre boutique : connectez-vous avec votre compte vendeur, ou créez-en un." : "A subscription belongs to your store: sign in with your seller account, or create one."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={signInHref} className="btn-primary rounded-xl px-6 py-2.5 text-sm font-semibold">{fr ? "Se connecter" : "Sign in"}</Link>
            <Link href="/seller/register" className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-semibold hover:bg-slate-50">
              {fr ? "Ouvrir une boutique" : "Open a store"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (storeError) return <LoadError message={storeError} onRetry={loadStore} />;
  if (store === undefined) return <SectionLoader />;
  if (store === null) {
    return (
      <div className="space-y-6">
        {planCards}
        <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-[var(--border)] bg-white p-6 text-center">
          <h2 className="font-semibold text-slate-900">{fr ? "Ouvrez d'abord votre boutique" : "Open your store first"}</h2>
          <p className="text-sm text-slate-600">{fr ? "L'offre s'attache à une boutique." : "A plan belongs to a store."}</p>
          <Link href="/seller/register" className="btn-primary inline-flex rounded-xl px-6 py-2.5 text-sm font-semibold">{fr ? "Ouvrir une boutique" : "Open a store"}</Link>
        </div>
      </div>
    );
  }

  // ── A payment is waiting / just went through ──────────────────────────────
  if (pendingPayment && (pendingPayment.status === "pending" || result || resumeId)) {
    const done = pendingPayment.status === "succeeded" || activated;
    return (
      <div className="space-y-4" data-testid="subscribe-progress">
        <PlanPaymentPending
          payment={pendingPayment}
          planName={planName(pendingPlan, pendingPayment.subject ?? "", fr)}
          activated={activated || (result?.status === "active" && (store.activePlan ?? store.plan) === result.plan.id)}
          onRetry={() => {
            setResult(null);
            setResumeId(null);
          }}
        />
        {(done || result?.status === "active") && (
          <div className="flex flex-col items-center gap-2">
            {expiresAt && <p className="text-sm text-slate-600">{fr ? `Active jusqu'au ${formatDate(expiresAt, fr)}` : `Active until ${formatDate(expiresAt, fr)}`}</p>}
            <Link href="/seller" className="btn-primary inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold">
              {fr ? "Aller au tableau de bord" : "Go to the dashboard"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    );
  }

  // ── The purchase form ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {storeUsable && waiting && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{fr ? "Un paiement de plan est en attente d'approbation sur votre téléphone." : "A plan payment is waiting for your approval on your phone."}</span>
          <button type="button" onClick={() => setResumeId(waiting.id)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">
            {fr ? "Voir" : "View"}
          </button>
        </div>
      )}
      {planCards}

      {!storeUsable ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {fr ? "Votre boutique n'est pas active : contactez le support." : "Your store is not active: contact support."}
        </p>
      ) : !chosen ? (
        <p className="text-center text-sm text-slate-600">{fr ? "Aucune offre payante n'est disponible en ligne pour le moment." : "No paid plan can be bought online right now."}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void pay();
          }}
          className="mx-auto max-w-xl space-y-5 rounded-2xl border border-[var(--border)] bg-white p-6"
          data-testid="subscribe-form"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              {fr ? `Payer l'offre ${planName(chosen, chosen.id, fr)}` : `Pay for the ${planName(chosen, chosen.id, fr)} plan`}
            </h2>
            <p className="font-[family-name:var(--font-display)] text-xl font-extrabold text-slate-900">{formatCurrency(chosen.priceUsd ?? 0, locale)}</p>
          </div>
          <p className="text-xs text-slate-500">
            {fr
              ? `Valable ${chosen.months} mois à partir de maintenant${activePlan === chosen.id && expiresAt ? " ; le temps restant est ajouté" : ""}.`
              : `Valid for ${chosen.months} month${chosen.months > 1 ? "s" : ""} from now${activePlan === chosen.id && expiresAt ? "; the time left is added" : ""}.`}
          </p>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-slate-600">{fr ? "Moyen de paiement" : "Payment method"}</legend>
            <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm", method === "wallet" ? "border-[var(--primary)] bg-blue-50/40" : "border-[var(--border)]")}>
              <input type="radio" name="method" checked={method === "wallet"} onChange={() => setMethod("wallet")} />
              <Wallet className="h-4 w-4 text-[var(--primary)]" />
              <span className="flex-1">
                {fr ? "Portefeuille Somba" : "Somba wallet"}
                <span className="block text-xs text-slate-500">
                  {fr ? `Solde : ${formatCurrency(rt.walletBalance, locale)} · activation immédiate` : `Balance: ${formatCurrency(rt.walletBalance, locale)} · active immediately`}
                </span>
              </span>
            </label>
            {MOBILE_METHODS.map((m) => (
              <label key={m} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm", method === m ? "border-[var(--primary)] bg-blue-50/40" : "border-[var(--border)]")}>
                <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
                <Smartphone className="h-4 w-4 text-[var(--primary)]" />
                <span className="flex-1">
                  {paymentMethodLabel(m, fr)}
                  <span className="block text-xs text-slate-500">{fr ? "Vous approuvez sur votre téléphone" : "You approve on your phone"}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {method !== "wallet" && (
            <div>
              <label htmlFor="plan-phone" className="mb-1 block text-xs font-medium text-slate-600">
                {fr ? "Numéro Mobile Money" : "Mobile Money number"}
              </label>
              <input
                id="plan-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="input-premium w-full px-4 py-2.5 text-sm"
                placeholder="+243 81 234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {phone && !phoneOk && <p className="mt-1 text-xs text-red-600">{fr ? "Saisissez un numéro valide, par ex. +243 81 234 5678." : "Enter a valid number, e.g. +243 81 234 5678."}</p>}
            </div>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy || !phoneOk} className="w-full">
            {busy ? (fr ? "Traitement…" : "Processing…") : method === "wallet" ? (fr ? `Payer ${formatCurrency(chosen.priceUsd ?? 0, locale)} avec le portefeuille` : `Pay ${formatCurrency(chosen.priceUsd ?? 0, locale)} from wallet`) : fr ? "Envoyer la demande de paiement" : "Send payment request"}
          </Button>
        </form>
      )}
    </div>
  );
}
