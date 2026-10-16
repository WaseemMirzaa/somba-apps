"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Check, Info, ArrowRight } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { SELLER_PLANS } from "@/lib/product-landing";
import { BrandMark } from "@/components/landing/brand-mark";
import { cn } from "@/lib/utils";

function SellerSubscribeContent() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const searchParams = useSearchParams();

  const planContent: Record<string, { name: string; desc: string; features: string[] }> = {
    starter: {
      name: "Starter",
      desc: "Parfait pour les nouveaux vendeurs — jusqu'à 100 produits, gestion des commandes et support par e-mail.",
      features: ["100 fiches produits", "Gestion des commandes", "Analyses de base", "Support par e-mail"],
    },
    pro: {
      name: "Professional",
      desc: "Boutiques en croissance — produits illimités, ventes flash, analyses avancées et support prioritaire.",
      features: ["Produits illimités", "Promotions et ventes flash", "Analyses avancées", "Support prioritaire", "Accès API"],
    },
    enterprise: {
      name: "Enterprise",
      desc: "Grandes marques — multi-boutiques, commission personnalisée, gestionnaire de compte dédié et SLA.",
      features: ["Multi-boutiques", "Commission personnalisée", "Gestionnaire dédié", "SLA et intégration", "Options marque blanche"],
    },
  };

  const raw = searchParams.get("plan");
  const highlighted = raw === "starter" ? "starter" : raw === "enterprise" ? "enterprise" : "pro";

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
            <Info className="h-8 w-8" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-slate-900">
            {fr ? "Offres vendeur — facturation bientôt disponible" : "Seller plans — billing coming soon"}
          </h1>
          <p className="mt-3 text-slate-600">
            {fr ? "Aperçu des offres prévues. Rien n'est facturé ni requis aujourd'hui." : "A preview of the planned plans. Nothing is charged or required today."}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {SELLER_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "card-premium relative flex flex-col p-6 text-left transition-all",
                highlighted === plan.id && "ring-2 ring-blue-500 shadow-lg"
              )}
            >
              {plan.popular && (
                <span className="absolute -top-2.5 right-4 btn-primary rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
                  {fr ? "Populaire" : "Popular"}
                </span>
              )}
              <h3 className="font-bold text-slate-900">{fr ? (planContent[plan.id]?.name ?? plan.name) : plan.name}</h3>
              <div className="mt-2">
                {plan.price !== null ? (
                  <p className="text-2xl font-extrabold text-slate-900">
                    ${plan.price}<span className="text-sm font-medium text-slate-500">{fr ? "/mois" : "/mo"}</span>
                  </p>
                ) : (
                  <p className="text-2xl font-extrabold text-slate-900">{fr ? "Sur mesure" : "Custom"}</p>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-600">{fr ? (planContent[plan.id]?.desc ?? plan.desc) : plan.desc}</p>
              <ul className="mt-4 space-y-2">
                {(fr ? (planContent[plan.id]?.features ?? [...plan.features]) : [...plan.features]).slice(0, 3).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                    <Check className="h-3 w-3 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-md space-y-3 text-center">
          <p className="text-sm text-slate-600">
            {fr
              ? "La facturation n'est pas encore disponible : aucun abonnement n'est nécessaire ni activable pour le moment. Votre boutique est utilisable dès que la modération l'a approuvée."
              : "Billing is not available yet: no subscription is needed or can be activated right now. Your store is usable as soon as moderation approves it."}
          </p>
          <Link href="/seller" className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3.5">
            {fr ? "Retour au portail vendeur" : "Back to the seller portal"}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="mailto:sales@somba.com?subject=Seller%20plans" className="block text-sm text-[var(--primary)] hover:underline">
            {fr ? "Contacter les ventes à propos des offres" : "Contact sales about plans"}
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SellerSubscribePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">{fr ? "Chargement…" : "Loading…"}</div>}>
      <SellerSubscribeContent />
    </Suspense>
  );
}
