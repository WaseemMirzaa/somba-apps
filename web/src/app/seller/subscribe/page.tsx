"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Check, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useSellerSubscription } from "@/context/seller-subscription-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { SELLER_PLANS } from "@/lib/product-landing";
import { BrandMark } from "@/components/landing/brand-mark";
import { cn } from "@/lib/utils";

function SellerSubscribeContent() {
  const { persona } = useAuth();
  const { purchasePlan, getSubscription } = useSellerSubscription();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const fr = locale === "fr";

  const initialPlan = (() => {
    const raw = searchParams.get("plan");
    if (raw === "professional" || raw === "pro") return "pro" as const;
    if (raw === "starter") return "starter" as const;
    if (raw === "enterprise") return "enterprise" as const;
    return "pro" as const;
  })();

  const [planId, setPlanId] = useState<"starter" | "pro" | "enterprise">(initialPlan);

  const existing = getSubscription(persona.id);

  function handleSubscribe() {
    if (planId === "enterprise") {
      window.location.href = "mailto:sales@somba.com?subject=Seller%20Enterprise%20Plan";
      return;
    }
    purchasePlan(persona.id, planId);
    toast(
      fr ? "Abonnement activé — bienvenue sur le portail vendeur !" : "Subscription activated — welcome to the seller portal!",
      "success"
    );
    router.push("/seller");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark />
          </Link>
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            {fr ? "Changer de compte" : "Switch account"}
          </Link>
        </div>

        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-slate-900">
            {fr ? "Abonnement vendeur requis" : "Seller subscription required"}
          </h1>
          <p className="mt-3 text-slate-600">
            {fr
              ? `Bonjour ${persona.name} — vous devez souscrire un abonnement pour accéder au portail vendeur.`
              : `Hi ${persona.name} — you need an active subscription to access the seller portal.`}
          </p>
          {existing && !existing.active && (
            <p className="mt-2 text-sm text-amber-700">
              {fr ? "Votre abonnement précédent a expiré." : "Your previous subscription has expired."}
            </p>
          )}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {SELLER_PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setPlanId(plan.id)}
              className={cn(
                "card-premium relative flex flex-col p-6 text-left transition-all",
                planId === plan.id && "ring-2 ring-blue-500 shadow-lg"
              )}
            >
              {plan.popular && (
                <span className="absolute -top-2.5 right-4 btn-primary rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
                  {fr ? "Populaire" : "Popular"}
                </span>
              )}
              <h3 className="font-bold text-slate-900">{plan.name}</h3>
              <div className="mt-2">
                {plan.price !== null ? (
                  <p className="text-2xl font-extrabold text-slate-900">
                    ${plan.price}<span className="text-sm font-medium text-slate-500">/mo</span>
                  </p>
                ) : (
                  <p className="text-2xl font-extrabold text-slate-900">{fr ? "Sur mesure" : "Custom"}</p>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-600">{plan.desc}</p>
              <ul className="mt-4 space-y-2">
                {plan.features.slice(0, 3).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                    <Check className="h-3 w-3 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-md">
          <button type="button" onClick={handleSubscribe} className="btn-primary flex w-full items-center justify-center gap-2 py-3.5">
            {planId === "enterprise"
              ? fr ? "Contacter les ventes" : "Contact sales"
              : fr ? "Activer l'abonnement" : "Activate subscription"}
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-4 text-center text-xs text-slate-500">
            {fr
              ? "Paiement simulé pour la démo. En production, redirection vers l'app ou Stripe."
              : "Mock payment for demo. In production, redirects to app or Stripe."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SellerSubscribePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>}>
      <SellerSubscribeContent />
    </Suspense>
  );
}
