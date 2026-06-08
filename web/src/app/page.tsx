"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Smartphone,
  Star,
  Clock,
  Users,
  TrendingUp,
  Quote,
  ShoppingBag,
  Store,
  Shield,
  Truck,
  Sparkles,
} from "lucide-react";
import { MarketingHeader } from "@/components/landing/marketing-header";
import { MarketingFooter } from "@/components/landing/marketing-footer";
import { StickyCta } from "@/components/landing/sticky-cta";
import { PortalExplorer } from "@/components/landing/portal-explorer";
import { PortalOverviewCards, PlatformModulesPremium } from "@/components/landing/portal-premium";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import {
  APP_LINKS,
  DEAL_HIGHLIGHTS,
  SELLER_PLANS,
  PLATFORM_STATS,
  PRODUCT_HERO,
  HERO_IMAGE,
  TRUST_SIGNALS,
  CONVERSION_PATHS,
  HOW_IT_WORKS,
  TESTIMONIALS,
  PORTAL_SECTION,
  MODULES_SECTION,
} from "@/lib/product-landing";
import { BRAND } from "@/lib/config";
import { categories, products } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import type { UserRole } from "@/lib/portal-access";
import { cn } from "@/lib/utils";

const PATH_ICONS = {
  shopper: ShoppingBag,
  seller: Store,
  staff: Shield,
} as const;

function SectionIntro({
  label,
  title,
  desc,
  center,
}: {
  label: string;
  title: string;
  desc?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("landing-section-header", center && "landing-section-header--center")}>
      <span className="section-label">{label}</span>
      <h2 className="section-title mt-4">{title}</h2>
      {desc && <p className="landing-section-desc">{desc}</p>}
    </div>
  );
}

export default function HomePage() {
  const { locale } = useLocale();
  const { persona, isAuthenticated, authReady } = useAuth();
  const fr = locale === "fr";
  const role = persona.role as UserRole;
  const [explorePortal, setExplorePortal] = useState<string | undefined>(undefined);

  function handleExplorePortal(portalId: string) {
    setExplorePortal(portalId);
    document.getElementById("portal-explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <MarketingHeader overlay />

      {/* ── HERO ── */}
      <section className="relative -mt-[72px] min-h-[94vh] overflow-hidden pt-[72px] text-white">
        <Image
          src={HERO_IMAGE.src}
          alt={HERO_IMAGE.alt}
          fill
          priority
          className="object-cover object-center scale-105"
          sizes="100vw"
        />
        <div className="hero-overlay absolute inset-0" aria-hidden />
        <div className="landing-hero-glow absolute -right-20 top-1/4 h-72 w-72 bg-blue-400/30" aria-hidden />
        <div className="landing-hero-glow absolute bottom-0 left-1/4 h-56 w-56 bg-indigo-500/20" aria-hidden />

        <div className="relative mx-auto flex min-h-[calc(94vh-72px)] max-w-7xl flex-col justify-center px-4 py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7 animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white/90 ring-1 ring-white/20 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {BRAND.fullName}
              </span>
              <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
                {fr ? PRODUCT_HERO.titleFr : PRODUCT_HERO.title}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80 sm:text-xl">
                {fr ? PRODUCT_HERO.subtitleFr : PRODUCT_HERO.subtitle}
              </p>

              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {(fr ? PRODUCT_HERO.bulletsFr : PRODUCT_HERO.bullets).map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-sm text-white/90">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 ring-1 ring-emerald-400/40">
                      <Check className="h-3.5 w-3.5 text-emerald-200" />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/shop/products"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-[var(--primary)] shadow-xl shadow-blue-900/25 transition-all hover:-translate-y-0.5 hover:shadow-2xl"
                >
                  {fr ? "Acheter maintenant" : "Shop now"}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/sell-online" className="btn-outline-light inline-flex items-center gap-2 px-8 py-4 text-base backdrop-blur-sm">
                  {fr ? "Vendre en ligne" : "Sell online"}
                </Link>
              </div>
              <p className="mt-4 text-xs text-white/55">{fr ? PRODUCT_HERO.guaranteeFr : PRODUCT_HERO.guarantee}</p>
            </div>

            <div className="hidden lg:col-span-5 lg:block animate-fade-up">
              <div className="landing-glass-panel p-7 text-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {fr ? "Offres du moment" : "Today's deals"}
                  </p>
                  <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-600 ring-1 ring-red-100">
                    {fr ? "Limité" : "Limited"}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {DEAL_HIGHLIGHTS.slice(0, 4).map((deal) => (
                    <Link key={deal.title} href={deal.href} className="landing-deal-tile group">
                      <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-bold text-white">
                        {fr ? deal.tagFr : deal.tag}
                      </span>
                      <p className="mt-2 text-sm font-bold text-slate-900 group-hover:text-[var(--primary)]">
                        {fr ? deal.titleFr : deal.title}
                      </p>
                      <p className="text-xs text-slate-500">{fr ? deal.subtitleFr : deal.subtitle}</p>
                    </Link>
                  ))}
                </div>
                <Link href="/shop/products" className="btn-primary mt-6 flex w-full items-center justify-center gap-2 py-3.5 text-sm">
                  {fr ? "Voir toutes les offres" : "Browse all deals"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST + STATS ── */}
      <section className="relative z-10 px-4 pb-4">
        <div className="landing-trust-bar mx-auto max-w-7xl px-6 py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {TRUST_SIGNALS.map((s) => (
              <span key={s.label} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-light)]">
                  <Check className="h-3.5 w-3.5 text-[var(--primary)]" />
                </span>
                {fr ? s.labelFr : s.label}
              </span>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-5 sm:grid-cols-4">
            {PLATFORM_STATS.map((stat) => (
              <div key={stat.label} className="landing-stat-pill text-center">
                <strong className="font-[family-name:var(--font-display)] text-xl font-extrabold text-slate-900">
                  {stat.value}
                </strong>
                <span className="text-xs font-medium text-slate-500">{fr ? stat.labelFr : stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATEGORIES ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-end justify-between gap-4">
            <SectionIntro
              label={fr ? "Catégories" : "Categories"}
              title={fr ? "Acheter par catégorie" : "Shop by category"}
            />
            <Link
              href="/shop/products"
              className="mb-1 hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline sm:inline-flex"
            >
              {fr ? "Tout voir" : "View all"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((cat) => (
              <Link key={cat.id} href="/shop/products" className="landing-category-card group">
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={cat.image}
                    alt={fr ? cat.nameFr : cat.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                    sizes="150px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                  <p className="absolute bottom-0 left-0 right-0 p-3 text-center text-xs font-bold text-white">
                    {fr ? cat.nameFr : cat.name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED PRODUCTS ── */}
      <section className="landing-section-alt border-y border-[var(--border)] py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-end justify-between gap-4">
            <SectionIntro
              label={fr ? "Sélection" : "Featured"}
              title={fr ? "Produits populaires" : "Popular products"}
              desc={fr ? "Les articles les mieux notés par nos acheteurs cette semaine." : "Top-rated picks from shoppers this week."}
            />
            <Link href="/shop/products" className="mb-1 shrink-0 text-sm font-semibold text-[var(--primary)] hover:underline">
              {fr ? "Boutique complète →" : "Full shop →"}
            </Link>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products.slice(0, 4).map((p) => (
              <Link key={p.id} href={`/shop/products/${p.id}`} className="landing-product-card group">
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  <Image
                    src={p.image}
                    alt={fr ? p.nameFr : p.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="280px"
                  />
                  {p.discount > 0 && (
                    <span className="absolute left-3 top-3 rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-md">
                      -{p.discount}%
                    </span>
                  )}
                  <span className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-xs font-bold text-amber-600 shadow-sm">
                    <Star className="h-3 w-3 fill-current" />
                    {p.rating}
                  </span>
                </div>
                <div className="p-5">
                  <p className="line-clamp-2 text-sm font-bold text-slate-900">{fr ? p.nameFr : p.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{p.seller}</p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--primary)]">
                      {formatCurrency(p.price, locale)}
                    </span>
                    {p.originalPrice > p.price && (
                      <span className="text-xs text-slate-400 line-through">{formatCurrency(p.originalPrice, locale)}</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{p.reviews.toLocaleString()} {fr ? "avis" : "reviews"}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONVERSION PATHS ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Par où commencer" : "Where to start"}
            title={fr ? "Choisissez votre parcours" : "Pick your path"}
            desc={fr ? "Achetez, vendez ou connectez-vous — tout sur une seule marketplace." : "Shop, sell, or sign in — everything on one marketplace."}
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {CONVERSION_PATHS.map((path) => {
              const Icon = PATH_ICONS[path.id as keyof typeof PATH_ICONS];
              return (
                <div
                  key={path.id}
                  className={cn(
                    "landing-path-card flex flex-col p-8",
                    path.highlight && "landing-path-card--highlight"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl",
                        path.highlight ? "bg-[var(--primary)] text-white shadow-lg shadow-blue-600/25" : "bg-slate-100 text-slate-600"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide",
                        path.highlight ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {fr ? path.badgeFr : path.badge}
                    </span>
                  </div>
                  <h3 className="mt-6 font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
                    {fr ? path.titleFr : path.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{fr ? path.descFr : path.desc}</p>
                  <Link
                    href={path.href}
                    className={cn(
                      "mt-8 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors",
                      path.highlight
                        ? "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                        : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                    )}
                  >
                    {fr ? path.ctaFr : path.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="border-y border-[var(--border)] bg-white py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-md lg:sticky lg:top-28">
              <SectionIntro
                label={fr ? "Processus" : "Process"}
                title={fr ? "De la découverte à la livraison en 4 étapes" : "From browse to delivery in 4 steps"}
                desc={fr ? PRODUCT_HERO.introFr : PRODUCT_HERO.intro}
              />
              <Link href="/shop/products" className="btn-primary mt-8 inline-flex items-center gap-2 px-6 py-3 text-sm">
                {fr ? "Commencer à acheter" : "Start shopping"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              {HOW_IT_WORKS.map((step) => (
                <div
                  key={step.step}
                  className="rounded-2xl border border-[var(--border)] bg-slate-50/80 p-6 transition-colors hover:border-blue-200 hover:bg-[var(--primary-light)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] font-[family-name:var(--font-display)] text-sm font-bold text-white">
                      {step.step}
                    </div>
                    <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-slate-900">
                      {fr ? step.titleFr : step.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{fr ? step.descFr : step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PORTALS ── */}
      <section id="portals" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Écosystème" : "Ecosystem"}
            title={fr ? PORTAL_SECTION.titleFr : PORTAL_SECTION.title}
            desc={fr ? PORTAL_SECTION.subtitleFr : PORTAL_SECTION.subtitle}
          />

          <div className="mt-14">
            <PortalOverviewCards
              fr={fr}
              role={role}
              isAuthenticated={isAuthenticated}
              authReady={authReady}
              personaPortal={persona.portal}
              onExplorePortal={handleExplorePortal}
            />
          </div>

          <div className="mt-16">
            <PortalExplorer
              fr={fr}
              role={role}
              isAuthenticated={isAuthenticated}
              authReady={authReady}
              personaPortal={persona.portal}
              initialPortalId={explorePortal}
            />
          </div>
        </div>
      </section>

      {/* ── PLATFORM MODULES ── */}
      <section id="modules" className="scroll-mt-20 border-y border-[var(--border)] landing-section-alt py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Services" : "Services"}
            title={fr ? MODULES_SECTION.titleFr : MODULES_SECTION.title}
            desc={fr ? MODULES_SECTION.subtitleFr : MODULES_SECTION.subtitle}
          />
          <div className="mt-12">
            <PlatformModulesPremium fr={fr} />
          </div>
        </div>
      </section>

      {/* ── SELLER PLANS ── */}
      <section id="pricing" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Vendeurs" : "For sellers"}
            title={fr ? "Vendez sur Somba & Tekka" : "Sell on Somba & Tekka"}
            desc={
              fr
                ? "Ouvrez votre boutique sur notre marketplace — choisissez un plan et commencez à vendre."
                : "Open your store on our marketplace — pick a plan and start selling to customers nationwide."
            }
          />
          <Link href="/sell-online" className="mx-auto mt-4 flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--primary)] hover:underline">
            {fr ? "En savoir plus sur la vente en ligne →" : "Learn more about selling online →"}
          </Link>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2">
              <Clock className="h-4 w-4 text-[var(--primary)]" />{fr ? "En ligne en 24 h" : "Live in 24 hours"}
            </span>
            <span className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2">
              <Users className="h-4 w-4 text-[var(--primary)]" />{fr ? "48K+ clients actifs" : "48K+ active customers"}
            </span>
            <span className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2">
              <TrendingUp className="h-4 w-4 text-[var(--primary)]" />{fr ? "Outils de croissance" : "Growth tools included"}
            </span>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
            {SELLER_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "landing-pricing-card flex flex-col p-7",
                  plan.popular && "landing-pricing-card--popular"
                )}
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">{plan.name}</h3>
                  {plan.popular && (
                    <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-bold text-white">
                      {fr ? "Populaire" : "Popular"}
                    </span>
                  )}
                </div>
                <p className="mt-2 flex-1 text-sm text-slate-500">{plan.desc}</p>
                <p className="mt-6 font-[family-name:var(--font-display)] text-3xl font-extrabold text-slate-900">
                  {plan.price !== null ? `$${plan.price}` : fr ? "Sur mesure" : "Custom"}
                  {plan.price !== null && <span className="text-sm font-medium text-slate-500">/mo</span>}
                </p>
                <Link
                  href={plan.id === "enterprise" ? APP_LINKS.contactSupport : "/login"}
                  className={cn(
                    "mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold",
                    plan.popular ? "btn-primary" : "border border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {plan.id === "enterprise" ? (fr ? "Contact" : "Contact") : (fr ? "S'abonner" : "Subscribe")}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="border-y border-[var(--border)] bg-white py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Témoignages" : "Testimonials"}
            title={fr ? "Ce que disent nos clients" : "What our customers say"}
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="landing-testimonial p-7">
                <Quote className="absolute right-5 top-5 h-8 w-8 text-blue-100" />
                <div className="flex gap-1 text-amber-400">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">&ldquo;{fr ? t.quoteFr : t.quote}&rdquo;</p>
                <div className="mt-6 flex items-center gap-3 border-t border-[var(--border)] pt-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-blue-800 text-xs font-bold text-white shadow-md">
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

      {/* ── FAQ ── */}
      <section className="landing-section-alt py-20">
        <div className="mx-auto max-w-3xl px-4">
          <SectionIntro
            center
            label="FAQ"
            title={fr ? "Questions fréquentes" : "Common questions"}
          />
          <div className="mt-10">
            <FaqAccordion fr={fr} />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="landing-band py-24">
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <Truck className="h-7 w-7 text-white" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight lg:text-4xl">
            {fr ? "Prêt à acheter ou vendre ?" : "Ready to shop or sell?"}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-white/75">
            {fr
              ? "Parcourez des milliers de produits ou ouvrez votre boutique vendeur sur Somba & Tekka."
              : "Browse thousands of products or open your seller store on Somba & Tekka."}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/shop/products"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-base font-bold text-[var(--primary)] shadow-xl shadow-blue-900/30 transition-all hover:-translate-y-0.5"
            >
              {fr ? "Acheter maintenant" : "Shop now"}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/sell-online" className="btn-outline-light px-10 py-4 text-base">
              {fr ? "Vendre en ligne" : "Sell online"}
            </Link>
          </div>
          <a href={APP_LINKS.contactSupport} className="mt-6 inline-block text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
            {fr ? "Besoin d'aide ?" : "Need help?"}
          </a>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href={APP_LINKS.ios}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white/90 ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/15"
            >
              <Smartphone className="h-4 w-4" /> App Store
            </a>
            <a
              href={APP_LINKS.android}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white/90 ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/15"
            >
              <Smartphone className="h-4 w-4" /> Google Play
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
      <StickyCta />
    </div>
  );
}
