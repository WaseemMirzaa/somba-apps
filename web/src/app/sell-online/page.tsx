"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Store,
  Star,
  Quote,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MarketingHeader } from "@/components/landing/marketing-header";
import { MarketingFooter } from "@/components/landing/marketing-footer";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { useLocale } from "@/context/locale-context";
import { BRAND } from "@/lib/config";
import {
  SELLER_PLANS,
  SELL_ONLINE_HERO,
  SELL_ONLINE_STATS,
  SELL_ONLINE_WHY,
  SELL_ONLINE_STEPS,
  SELL_ONLINE_TOOLS,
  SELL_ONLINE_FAQ,
  SELL_ONLINE_IMAGE,
  TESTIMONIALS,
} from "@/lib/product-landing";
import { cn } from "@/lib/utils";

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  const Icon = icons[name] ?? LucideIcons.Circle;
  return <Icon className={className} />;
}

const sellerTestimonials = TESTIMONIALS.filter((t) => t.role.includes("Store") || t.role.includes("Owner"));

export default function SellOnlinePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden text-white">
        <Image src={SELL_ONLINE_IMAGE.src} alt={SELL_ONLINE_IMAGE.alt} fill priority className="object-cover object-center" sizes="100vw" />
        <div className="hero-overlay absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 lg:py-32">
          <div className="max-w-2xl">
            <span className="section-label !bg-[var(--primary)] !text-white !shadow-none ring-1 ring-white/25">
              {fr ? "Programme vendeur" : "Seller program"}
            </span>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-extrabold leading-tight tracking-tight lg:text-5xl">
              {fr ? "Développez votre activité —" : "Grow your business —"}
              <br />
              {fr ? "vendez en ligne sur Somba&Teka" : "sell online on Somba&Teka"}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-white/88">
              {fr ? SELL_ONLINE_HERO.subtitleFr : SELL_ONLINE_HERO.subtitle}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="btn-primary inline-flex items-center gap-2 px-8 py-4 text-base font-bold"
              >
                {fr ? SELL_ONLINE_HERO.ctaFr : SELL_ONLINE_HERO.cta}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a href="#plans" className="btn-outline-light inline-flex items-center gap-2 px-8 py-4 text-base">
                {fr ? SELL_ONLINE_HERO.secondaryCtaFr : SELL_ONLINE_HERO.secondaryCta}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-[var(--border)] bg-white py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 sm:grid-cols-4">
          {SELL_ONLINE_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--primary)]">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-600">{fr ? stat.labelFr : stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why sell */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="section-label">{fr ? "Avantages" : "Why sell"}</span>
            <h2 className="section-title mt-4">
              {fr ? `Pourquoi vendre sur ${BRAND.fullName} ?` : `Why sell on ${BRAND.fullName}?`}
            </h2>
            <p className="mt-4 text-slate-600">
              {fr
                ? "Tout ce dont vous avez besoin pour lancer et développer votre boutique en ligne."
                : "Everything you need to launch and grow your online store on our marketplace."}
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SELL_ONLINE_WHY.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-[var(--border)] bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[var(--primary)]">
                  <DynamicIcon name={item.icon} className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">
                  {fr ? item.titleFr : item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{fr ? item.descFr : item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to start */}
      <section className="border-y border-[var(--border)] bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="section-label">{fr ? "Démarrage" : "Get started"}</span>
            <h2 className="section-title mt-4">
              {fr ? "Comment commencer à vendre" : "How to start selling"}
            </h2>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {SELL_ONLINE_STEPS.map((step) => (
              <div key={step.step} className="relative rounded-2xl border border-[var(--border)] bg-white p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)] font-[family-name:var(--font-display)] text-lg font-bold text-white">
                  {step.step}
                </div>
                <h3 className="mt-5 font-bold text-slate-900">{fr ? step.titleFr : step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{fr ? step.descFr : step.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link href="/login" className="btn-primary inline-flex items-center gap-2 px-8 py-3.5 text-base">
              {fr ? "Créer un compte vendeur" : "Create seller account"}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Seller tools */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="section-label">{fr ? "Outils" : "Seller tools"}</span>
            <h2 className="section-title mt-4">
              {fr ? "Portail vendeur tout-en-un" : "All-in-one seller portal"}
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SELL_ONLINE_TOOLS.map((tool) => (
              <div key={tool.name} className="flex gap-4 rounded-2xl border border-[var(--border)] bg-white p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[var(--primary)]">
                  <DynamicIcon name={tool.icon} className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{fr ? tool.nameFr : tool.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{fr ? tool.descFr : tool.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="scroll-mt-20 border-y border-[var(--border)] bg-white py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="section-label">{fr ? "Tarifs" : "Pricing"}</span>
            <h2 className="section-title mt-4">{fr ? "Plans vendeur" : "Seller plans"}</h2>
            <p className="mt-4 text-slate-600">
              {fr ? "Choisissez le plan adapté à votre activité — changez à tout moment." : "Pick the plan that fits your business — upgrade anytime."}
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3">
            {SELLER_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-2xl border p-7",
                  plan.popular ? "border-[var(--primary)] shadow-lg ring-1 ring-[var(--primary)]/15" : "border-[var(--border)]"
                )}
              >
                {plan.popular && (
                  <span className="mb-4 inline-flex w-fit rounded-full bg-[var(--primary)] px-3 py-1 text-[10px] font-bold uppercase text-white">
                    {fr ? "Populaire" : "Popular"}
                  </span>
                )}
                <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">{plan.name}</h3>
                <p className="mt-2 text-sm text-slate-500">{plan.desc}</p>
                <p className="mt-6 font-[family-name:var(--font-display)] text-3xl font-extrabold text-slate-900">
                  {plan.price !== null ? `$${plan.price}` : fr ? "Sur mesure" : "Custom"}
                  {plan.price !== null && <span className="text-sm font-medium text-slate-500">/mo</span>}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={
                    plan.id === "enterprise"
                      ? "/sell-online/subscribe?plan=enterprise"
                      : `/sell-online/subscribe?plan=${plan.id}`
                  }
                  className={cn(
                    "mt-8 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold",
                    plan.popular ? "btn-primary" : "border border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {plan.id === "enterprise" ? (fr ? "Contact" : "Contact sales") : (fr ? "Commencer" : "Get started")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seller testimonials */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center">
            <span className="section-label">{fr ? "Témoignages" : "Success stories"}</span>
            <h2 className="section-title mt-4">{fr ? "Ils vendent sur Somba&Teka" : "Sellers who grew with us"}</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {(sellerTestimonials.length > 0 ? sellerTestimonials : TESTIMONIALS.slice(1, 3)).map((t) => (
              <div key={t.name} className="relative rounded-2xl border border-[var(--border)] bg-white p-7">
                <Quote className="absolute right-5 top-5 h-8 w-8 text-blue-100" />
                <div className="flex gap-1 text-amber-400">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">&ldquo;{fr ? t.quoteFr : t.quote}&rdquo;</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{fr ? t.roleFr : t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4">
          <div className="text-center">
            <span className="section-label">FAQ</span>
            <h2 className="section-title mt-4">{fr ? "Questions vendeur" : "Seller FAQ"}</h2>
          </div>
          <div className="mt-10">
            <FaqAccordion fr={fr} items={SELL_ONLINE_FAQ} />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-band py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
            <Store className="h-8 w-8 text-white" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold lg:text-4xl">
            {fr ? "Prêt à vendre en ligne ?" : "Ready to sell online?"}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/80">
            {fr
              ? `Rejoignez ${BRAND.fullName} et touchez des milliers d'acheteurs dès cette semaine.`
              : `Join ${BRAND.fullName} and reach thousands of shoppers this week.`}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-base font-bold text-[var(--primary)] shadow-xl hover:bg-white/95">
              {fr ? "Commencer à vendre" : "Start selling now"}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/" className="btn-outline-light px-10 py-4 text-base">
              {fr ? "Retour à la boutique" : "Back to shop"}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
