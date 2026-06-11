"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useSellerSubscription } from "@/context/seller-subscription-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { SELLER_PLANS } from "@/lib/product-landing";
import { BRAND } from "@/lib/config";
import { cn } from "@/lib/utils";

export default function SellerSubscribePage() {
  const { persona } = useAuth();
  const { purchasePlan, getSubscription } = useSellerSubscription();
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useLocale();
  const [planId, setPlanId] = useState<"starter" | "pro" | "enterprise">("pro");
  const subscriptionDetail = t("subscriptionRequiredMessage").split("—").slice(1).join("—").trim();

  const existing = getSubscription(persona.id);

  function handleSubscribe() {
    if (planId === "enterprise") {
      window.location.href = "mailto:sales@somba.com?subject=Seller%20Enterprise%20Plan";
      return;
    }
    purchasePlan(persona.id, planId);
    toast(t("subscriptionActivated"), "success");
    router.push("/seller");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-xs font-bold text-white">
              S
            </div>
            <span className="font-[family-name:var(--font-display)] font-bold text-slate-900">{BRAND.name}</span>
          </Link>
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            {t("switchAccount")}
          </Link>
        </div>

        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-slate-900">
            {t("sellerSubscriptionRequired")}
          </h1>
          <p className="mt-3 text-slate-600">
            {persona.name} — {subscriptionDetail}
          </p>
          {existing && !existing.active && (
            <p className="mt-2 text-sm text-amber-700">
              {t("subscriptionExpired")}
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
                <span className="absolute -top-2.5 right-4 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {t("popular")}
                </span>
              )}
              <h3 className="font-bold text-slate-900">{plan.name}</h3>
              <div className="mt-2">
                {plan.price !== null ? (
                  <p className="text-2xl font-extrabold text-slate-900">
                    ${plan.price}<span className="text-sm font-medium text-slate-500">/mo</span>
                  </p>
                ) : (
                  <p className="text-2xl font-extrabold text-slate-900">{t("custom")}</p>
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
              ? t("contactSales")
              : t("activateSubscription")}
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-4 text-center text-xs text-slate-500">
            {t("mockPaymentNote")}
          </p>
        </div>
      </div>
    </div>
  );
}
