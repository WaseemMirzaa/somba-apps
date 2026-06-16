"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Check, ArrowRight, CreditCard, Lock } from "lucide-react";
import { MarketingHeader } from "@/components/landing/marketing-header";
import { MarketingFooter } from "@/components/landing/marketing-footer";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { SELLER_PLANS } from "@/lib/product-landing";
import { cn } from "@/lib/utils";

type PlanId = "starter" | "pro" | "enterprise";

function normalizePlanId(raw: string | null): PlanId {
  if (raw === "professional" || raw === "pro") return "pro";
  if (raw === "starter") return "starter";
  if (raw === "enterprise") return "enterprise";
  return "pro";
}

function SubscribeCheckoutContent() {
  const searchParams = useSearchParams();
  const planId = normalizePlanId(searchParams.get("plan"));
  const { locale } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const fr = locale === "fr";

  const plan = SELLER_PLANS.find((p) => p.id === planId) ?? SELLER_PLANS[1];

  const [step, setStep] = useState<"form" | "success">("form");
  const [form, setForm] = useState({
    businessName: "",
    email: "",
    cardNumber: "",
    expiry: "",
    cvc: "",
    billingName: "",
    billingAddress: "",
  });

  if (planId === "enterprise") {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <MarketingHeader />
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-slate-900">
            {fr ? "Plan Enterprise" : "Enterprise Plan"}
          </h1>
          <p className="mt-4 text-slate-600">
            {fr
              ? "Notre équipe commerciale vous contactera pour un devis sur mesure."
              : "Our sales team will reach out with a custom quote and onboarding plan."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:sales@somba.com?subject=Somba%20Enterprise%20Seller%20Plan"
              className="btn-primary inline-flex items-center gap-2 px-8 py-3"
            >
              {fr ? "Contacter les ventes" : "Contact sales"}
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/sell-online#plans" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-8 py-3 text-sm font-semibold hover:bg-slate-50">
              {fr ? "Voir les plans" : "View plans"}
            </Link>
          </div>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.businessName || !form.email || !form.cardNumber) {
      toast(fr ? "Veuillez remplir les champs requis" : "Please fill in required fields", "error");
      return;
    }
    setStep("success");
    toast(fr ? "Abonnement confirmé !" : "Subscription confirmed!", "success");
  }

  function goToPortal() {
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <MarketingHeader />

      <div className="mx-auto max-w-5xl px-4 py-12 lg:py-16">
        <div className="mb-8">
          <Link href="/sell-online#plans" className="text-sm font-medium text-[var(--primary)] hover:underline">
            ← {fr ? "Retour aux plans" : "Back to plans"}
          </Link>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold text-slate-900">
            {fr ? "Finaliser votre abonnement" : "Complete your subscription"}
          </h1>
          <p className="mt-2 text-slate-600">
            {fr ? "Paiement simulé pour la démo — aucun frais réel." : "Mock checkout for demo — no real charges."}
          </p>
        </div>

        {step === "success" ? (
          <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-8 w-8" />
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
              {fr ? "Abonnement activé !" : "You're subscribed!"}
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              {fr
                ? `Plan ${plan.name} — $${plan.price}/mois. Connectez-vous pour accéder au portail vendeur.`
                : `${plan.name} plan — $${plan.price}/mo. Sign in to access your seller portal.`}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button type="button" onClick={goToPortal} className="btn-primary flex w-full items-center justify-center gap-2 py-3">
                {fr ? "Se connecter au portail vendeur" : "Sign in to seller portal"}
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link href="/seller/register" className="text-sm font-medium text-[var(--primary)] hover:underline">
                {fr ? "Créer un compte vendeur" : "Create a seller account"}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-5">
            {/* Plan summary */}
            <div className="lg:col-span-2">
              <div
                className={cn(
                  "rounded-2xl border p-6",
                  plan.popular ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/15 shadow-lg" : "border-[var(--border)]"
                )}
              >
                {plan.popular && (
                  <span className="mb-3 inline-flex rounded-full bg-[var(--primary)] px-3 py-1 text-[10px] font-bold uppercase text-white">
                    {fr ? "Populaire" : "Popular"}
                  </span>
                )}
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">{plan.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{plan.desc}</p>
                <p className="mt-4 font-[family-name:var(--font-display)] text-3xl font-extrabold text-slate-900">
                  ${plan.price}
                  <span className="text-sm font-medium text-slate-500">/{fr ? "mois" : "mo"}</span>
                </p>
                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Payment form */}
            <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-3">
              <div className="rounded-2xl border border-[var(--border)] bg-white p-6">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  <CreditCard className="h-5 w-5 text-[var(--primary)]" />
                  {fr ? "Informations de facturation" : "Billing details"}
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input
                    className="input-premium px-4 py-2.5 text-sm sm:col-span-2"
                    placeholder={fr ? "Nom de l'entreprise *" : "Business name *"}
                    value={form.businessName}
                    onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                    required
                  />
                  <input
                    className="input-premium px-4 py-2.5 text-sm sm:col-span-2"
                    placeholder={fr ? "Email professionnel *" : "Business email *"}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                  <input
                    className="input-premium px-4 py-2.5 text-sm sm:col-span-2"
                    placeholder={fr ? "Nom sur la carte" : "Name on card"}
                    value={form.billingName}
                    onChange={(e) => setForm({ ...form, billingName: e.target.value })}
                  />
                  <input
                    className="input-premium px-4 py-2.5 text-sm sm:col-span-2"
                    placeholder={fr ? "Adresse de facturation" : "Billing address"}
                    value={form.billingAddress}
                    onChange={(e) => setForm({ ...form, billingAddress: e.target.value })}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-white p-6">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  <Lock className="h-5 w-5 text-[var(--primary)]" />
                  {fr ? "Paiement par carte" : "Card payment"}
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input
                    className="input-premium px-4 py-2.5 text-sm sm:col-span-2"
                    placeholder={fr ? "Numéro de carte *" : "Card number *"}
                    value={form.cardNumber}
                    onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
                    required
                  />
                  <input
                    className="input-premium px-4 py-2.5 text-sm"
                    placeholder="MM/YY"
                    value={form.expiry}
                    onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                  />
                  <input
                    className="input-premium px-4 py-2.5 text-sm"
                    placeholder="CVC"
                    value={form.cvc}
                    onChange={(e) => setForm({ ...form, cvc: e.target.value })}
                  />
                </div>
              </div>

              <button
                type="submit"
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold",
                  plan.popular ? "btn-primary" : "border border-slate-200 bg-white hover:bg-slate-50"
                )}
              >
                {fr ? `Confirmer — $${plan.price}/mois` : `Confirm purchase — $${plan.price}/mo`}
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-center text-xs text-slate-500">
                {fr
                  ? "Paiement simulé. En production, redirection vers Stripe ou l'app mobile."
                  : "Mock payment. In production, redirects to Stripe or the mobile app."}
              </p>
            </form>
          </div>
        )}
      </div>

      <MarketingFooter />
    </div>
  );
}

export default function SellOnlineSubscribePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>}>
      <SubscribeCheckoutContent />
    </Suspense>
  );
}
