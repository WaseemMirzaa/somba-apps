"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Search,
  Star,
  Truck,
  ShieldCheck,
  RotateCcw,
  Store,
  ShoppingBag,
  Shield,
  Sparkles,
  Smartphone,
  ChevronRight,
  BadgeCheck,
  Wallet,
  Headphones,
  Globe,
  X,
} from "lucide-react";
import { MarketingHeader } from "@/components/landing/marketing-header";
import { MarketingFooter } from "@/components/landing/marketing-footer";
import { StickyCta } from "@/components/landing/sticky-cta";
import { PortalExplorer } from "@/components/landing/portal-explorer";
import { PortalOverviewCards } from "@/components/landing/portal-premium";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { SearchAutocomplete } from "@/components/shop/search-autocomplete";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import {
  APP_LINKS,
  PRODUCT_HERO,
  CONVERSION_PATHS,
  HOW_IT_WORKS,
  PORTAL_SECTION,
  MODULES_SECTION,
  PLATFORM_MODULES,
} from "@/lib/product-landing";
import { BRAND } from "@/lib/config";
import { useCatalog, useShopCategories, priceView } from "@/lib/catalog";
import { useSellerPlans } from "@/lib/shop-live";
import { formatCurrency } from "@/lib/utils";
import type { UserRole } from "@/lib/portal-access";
import { cn } from "@/lib/utils";

const MODULE_ICONS = {
  fulfillment: Truck,
  payments: ShieldCheck,
  returns: RotateCcw,
  subscription: Store,
} as const;

const MARQUEE_ITEMS = [
  { icon: Truck, en: "Live delivery tracking", fr: "Suivi de livraison en direct" },
  { icon: RotateCcw, en: "7-day returns", fr: "Retours sous 7 jours" },
  { icon: Wallet, en: "Mobile money · Wallet", fr: "Mobile money · Portefeuille" },
  { icon: BadgeCheck, en: "Verified sellers", fr: "Vendeurs vérifiés" },
  { icon: Globe, en: "Bilingual FR / EN", fr: "Bilingue FR / EN" },
] as const;

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
      <span className="title-flourish" aria-hidden />
      {desc && <p className="landing-section-desc">{desc}</p>}
    </div>
  );
}

export default function HomePage() {
  const { locale } = useLocale();
  const { persona, isAuthenticated, authReady } = useAuth();
  const router = useRouter();
  const products = useCatalog();
  const categories = useShopCategories();
  const fr = locale === "fr";
  const role = persona.role as UserRole;
  const [explorePortal, setExplorePortal] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");

  function handleExplorePortal(portalId: string) {
    setExplorePortal(portalId);
    document.getElementById("portal-explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/shop/search?q=${encodeURIComponent(q)}` : "/shop/products");
  }

  const shopPath = CONVERSION_PATHS.find((p) => p.id === "shopper")!;
  const sellPath = CONVERSION_PATHS.find((p) => p.id === "seller")!;
  const staffPath = CONVERSION_PATHS.find((p) => p.id === "staff")!;
  const heroProducts = products.slice(0, 2);
  const { plans, error: plansError, reload: reloadPlans } = useSellerPlans();
  const topRated = [...products]
    .sort((a, b) => (b.reviews > 0 ? b.rating : 0) - (a.reviews > 0 ? a.rating : 0) || b.reviews - a.reviews)
    .slice(0, 8);
  const cheapestPaid = (plans ?? []).filter((p) => p.priceUsd != null && p.priceUsd > 0).sort((a, b) => (a.priceUsd as number) - (b.priceUsd as number))[0];
  // Real figures only: what the live catalogue says right now (the list is capped at 500 rows).
  const PAGE = 500;
  const storeCount = new Set(products.map((p) => p.sellerId).filter(Boolean)).size;
  const liveStats = [
    { value: products.length >= PAGE ? `${PAGE}+` : String(products.length), label: "Products on sale", labelFr: "Produits en vente" },
    { value: String(storeCount), label: "Stores with products", labelFr: "Boutiques avec des produits" },
    { value: String(categories.length), label: "Categories", labelFr: "Catégories" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden border-b border-[var(--border)]">
        <div className="hero-mesh" aria-hidden />
        <div className="hero-grid" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:gap-12 lg:py-24">
          {/* Left — content */}
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--primary-tint)] bg-[var(--primary-light)] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--brand-red)]" />
              {BRAND.fullName} · {fr ? "Marketplace en ligne" : "Online marketplace"}
            </span>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[1.02] tracking-tight text-slate-900 text-balance sm:text-6xl lg:text-[4.25rem]">
              {fr ? "Achetez malin," : "Shop smarter,"}
              <br />
              <span className="text-gradient-brand">{fr ? "livré plus vite." : "delivered faster."}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              {fr ? PRODUCT_HERO.subtitleFr : PRODUCT_HERO.subtitle}
            </p>

            {/* Search */}
            <form onSubmit={submitSearch} className="relative mt-8 max-w-xl">
              <div className="hero-search flex items-center gap-2 p-2 pl-4">
                <Search className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={fr ? "Rechercher produits, marques, catégories…" : "Search products, brands and categories…"}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  aria-label={fr ? "Rechercher" : "Search"}
                />
                <button type="submit" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
                  <Search className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{fr ? "Rechercher" : "Search"}</span>
                </button>
              </div>
              <SearchAutocomplete query={query} onSelect={() => setQuery("")} />
            </form>

            {/* Quick categories */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">{fr ? "Populaire :" : "Popular:"}</span>
              {categories.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href={`/shop/search?q=${encodeURIComponent(c.name)}`}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-[var(--primary-tint)] hover:text-[var(--primary)]"
                >
                  {fr ? c.nameFr : c.name}
                </Link>
              ))}
            </div>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/shop/products" className="btn-primary inline-flex items-center gap-2 px-7 py-3.5 text-base">
                {fr ? "Tout parcourir" : "Browse products"}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/sell-online"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                {fr ? "Vendre sur Somba&Teka" : "Sell on Somba&Teka"}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Trust row */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                <BadgeCheck className="h-4 w-4 text-[var(--primary)]" />
                {fr ? "Vendeurs vérifiés" : "Verified sellers"}
              </span>
            </div>
          </div>

          {/* Right — showcase bento */}
          <div className="relative hidden lg:block animate-rise delay-200">
            <div className="grid h-[540px] grid-cols-2 grid-rows-2 gap-4">
              {/* Featured large product */}
              {heroProducts[1] && (
              <Link href={`/shop/products/${heroProducts[1].id}`} className="showcase-card group row-span-2 flex flex-col bg-white">
                <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-[var(--primary-light)]">
                  <Image
                    src={heroProducts[1].image || "/brand/logo-stack.png"}
                    alt={fr ? heroProducts[1].nameFr : heroProducts[1].name}
                    fill
                    preload
                    sizes="320px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {priceView(heroProducts[1]).pct > 0 && (
                  <span className="absolute left-3 top-3 rounded-full bg-[var(--brand-red)] px-2.5 py-1 text-[10px] font-bold text-white shadow">
                    -{priceView(heroProducts[1]).pct}%
                  </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="line-clamp-1 text-sm font-bold text-slate-900">{fr ? heroProducts[1].nameFr : heroProducts[1].name}</p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--primary)]">
                    {formatCurrency(heroProducts[1].price, locale)}
                  </p>
                </div>
              </Link>
              )}

              {/* Secondary product */}
              {heroProducts[0] && (
              <Link href={`/shop/products/${heroProducts[0].id}`} className="showcase-card group flex flex-col bg-white">
                <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-[var(--primary-light)]">
                  <Image
                    src={heroProducts[0].image || "/brand/logo-stack.png"}
                    alt={fr ? heroProducts[0].nameFr : heroProducts[0].name}
                    fill
                    sizes="240px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 text-xs font-bold text-slate-900">{fr ? heroProducts[0].nameFr : heroProducts[0].name}</p>
                  <p className="mt-0.5 text-sm font-extrabold text-[var(--primary)]">{formatCurrency(heroProducts[0].price, locale)}</p>
                </div>
              </Link>
              )}

              {/* Offer tile */}
              <Link
                href="/shop/products"
                className="showcase-card group relative flex flex-col justify-between bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] p-5 text-white"
              >
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-white/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-red)] animate-pulse" />
                  {fr ? "Offres flash" : "Flash deals"}
                </span>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold">{fr ? "Offres du moment" : "Today's deals"}</p>
                  <p className="text-sm text-white/80">{fr ? "sur une sélection" : "on selected items"}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-bold">
                    {fr ? "Voir" : "Shop"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </div>

          </div>
        </div>

        {/* Trust marquee */}
        <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] py-4">
          <div className="marquee-mask mx-auto max-w-7xl">
            <div className="marquee-track">
              {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((m, i) => (
                <span key={i} className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-500">
                  <m.icon className="h-4 w-4 text-[var(--primary)]" />
                  {fr ? m.fr : m.en}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CATEGORY RAIL ── */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="section-label">{fr ? "Catégories" : "Categories"}</span>
              <h2 className="section-title mt-3 text-3xl">{fr ? "Acheter par catégorie" : "Shop by category"}</h2>
            </div>
            <Link href="/shop/products" className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline sm:inline-flex">
              {fr ? "Tout voir" : "View all"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="cat-rail mt-8">
            {categories.map((cat) => (
              <Link key={cat.id} href={`/shop/search?q=${encodeURIComponent(cat.name)}`} className="cat-tile group">
                <div className="relative aspect-[5/4] overflow-hidden">
                  <Image
                    src={cat.image || "/brand/logo-stack.png"}
                    alt={fr ? cat.nameFr : cat.name}
                    fill
                    sizes="160px"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-slate-900/10 to-transparent" />
                  <span className="absolute left-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-base shadow-sm">
                    {cat.icon}
                  </span>
                </div>
                <p className="px-3 py-2.5 text-sm font-bold text-slate-900 group-hover:text-[var(--primary)]">
                  {fr ? cat.nameFr : cat.name}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRENDING PRODUCTS ── */}
      <section className="landing-section-alt border-y border-[var(--border)] py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-end justify-between gap-4">
            <SectionIntro
              label={fr ? "Sélection" : "Top rated"}
              title={fr ? "Les mieux notés" : "Top-rated products"}
              desc={fr ? "Classés selon les notes laissées par nos acheteurs." : "Ranked by the ratings shoppers have left."}
            />
            <Link href="/shop/products" className="mb-1 hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline sm:inline-flex">
              {fr ? "Boutique complète" : "Full shop"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
            {topRated.map((p) => {
              const pv = priceView(p);
              return (
              <Link key={p.id} href={`/shop/products/${p.id}`} className="pcard group block">
                <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-50 to-[var(--primary-light)]">
                  <Image
                    src={p.image || "/brand/logo-stack.png"}
                    alt={fr ? p.nameFr : p.name}
                    fill
                    sizes="(max-width: 1024px) 50vw, 280px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {pv.pct > 0 && (
                    <span className="absolute left-3 top-3 rounded-lg bg-[var(--brand-red)] px-2.5 py-1 text-xs font-bold text-white shadow-md">
                      -{pv.pct}%
                    </span>
                  )}
                  {p.reviews > 0 && (
                    <span className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-xs font-bold text-amber-700 shadow-sm">
                      <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                      {p.rating}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="line-clamp-1 text-sm font-bold text-slate-900 group-hover:text-[var(--primary)]">{fr ? p.nameFr : p.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{p.seller}</p>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--primary)]">
                      {formatCurrency(pv.price, locale)}
                    </span>
                    {pv.was != null && (
                      <s className="text-xs text-slate-500">
                        <span className="sr-only">{fr ? "Ancien prix " : "Was "}</span>
                        {formatCurrency(pv.was, locale)}
                      </s>
                    )}
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── VALUE BENTO ── */}
      <section id="modules" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Nos services" : "Why Somba&Teka"}
            title={fr ? MODULES_SECTION.titleFr : MODULES_SECTION.title}
            desc={fr ? MODULES_SECTION.subtitleFr : MODULES_SECTION.subtitle}
          />

          <div className="mt-12 grid gap-4 lg:grid-cols-4 lg:grid-rows-2 lg:auto-rows-fr">
            {PLATFORM_MODULES.map((mod, idx) => {
              const Icon = MODULE_ICONS[mod.id as keyof typeof MODULE_ICONS] ?? Sparkles;
              const big = idx === 0;
              const spanClass = big
                ? "lg:col-span-2 lg:row-span-2 min-h-[260px]"
                : idx === 1
                  ? "lg:col-span-2 min-h-[200px]"
                  : "lg:col-span-1 min-h-[200px]";
              return (
                <Link key={mod.id} href={mod.href} className={cn("bento-cell group flex", spanClass)}>
                  {big ? (
                    <div className="relative flex w-full flex-col justify-end overflow-hidden p-7 text-white">
                      <Image
                        src={mod.image}
                        alt={fr ? mod.nameFr : mod.name}
                        fill
                        sizes="(max-width: 1024px) 100vw, 560px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--primary-dark)] via-[var(--primary-dark)]/70 to-[var(--primary)]/30" />
                      <div className="relative">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                          <Icon className="h-6 w-6" />
                        </span>
                        <span className="mt-4 inline-flex rounded-full bg-[var(--brand-red)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                          {fr ? mod.highlightFr : mod.highlight}
                        </span>
                        <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-extrabold">{fr ? mod.nameFr : mod.name}</h3>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85">{fr ? mod.descFr : mod.desc}</p>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold">
                          {fr ? mod.ctaFr : mod.cta}
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex w-full flex-col p-6">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-light)] text-[var(--primary)]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="mt-4 flex items-center gap-2">
                        <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900 group-hover:text-[var(--primary)]">
                          {fr ? mod.nameFr : mod.name}
                        </h3>
                        <span className="rounded-full bg-[var(--brand-red-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--brand-red)]">
                          {fr ? mod.highlightFr : mod.highlight}
                        </span>
                      </div>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{fr ? mod.descFr : mod.desc}</p>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--primary)]">
                        {fr ? mod.ctaFr : mod.cta}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SHOP / SELL SPLIT ── */}
      <section className="landing-section-alt border-y border-[var(--border)] py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Par où commencer" : "Where to start"}
            title={fr ? "Acheter ou vendre — au même endroit" : "Shop or sell — all in one place"}
            desc={fr ? "Que vous achetiez ou développiez votre activité, tout commence ici." : "Whether you're buying or growing a business, it starts here."}
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {/* Shop panel */}
            <div className="split-panel flex flex-col bg-white p-8 lg:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
                <ShoppingBag className="h-6 w-6" />
              </span>
              <h3 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-extrabold text-slate-900">
                {fr ? shopPath.titleFr : shopPath.title}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">{fr ? shopPath.descFr : shopPath.desc}</p>
              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {(fr ? PRODUCT_HERO.bulletsFr : PRODUCT_HERO.bullets).map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link href={shopPath.href} className="btn-primary mt-8 inline-flex w-fit items-center gap-2 px-7 py-3.5 text-base">
                {fr ? shopPath.ctaFr : shopPath.cta}
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>

            {/* Sell panel */}
            <div className="split-panel split-panel--dark flex flex-col p-8 lg:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <Store className="h-6 w-6" />
              </span>
              <h3 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-extrabold">
                {fr ? sellPath.titleFr : sellPath.title}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">{fr ? sellPath.descFr : sellPath.desc}</p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                {cheapestPaid && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
                    {fr ? `Dès ${cheapestPaid.priceUsd} $/mois` : `From $${cheapestPaid.priceUsd}/mo`}
                  </span>
                )}
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={sellPath.href}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-bold text-[var(--primary)] shadow-lg transition-all hover:-translate-y-0.5"
                >
                  {fr ? sellPath.ctaFr : sellPath.cta}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/sell-online" className="text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
                  {fr ? "Voir les plans →" : "View plans →"}
                </Link>
              </div>
            </div>
          </div>

          {/* Staff strip */}
          <Link
            href={staffPath.href}
            className="group mt-6 flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-white px-6 py-5 transition-colors hover:border-[var(--primary-tint)]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Shield className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold text-slate-900">{fr ? staffPath.titleFr : staffPath.title}</p>
                <p className="text-sm text-slate-500">{fr ? staffPath.descFr : staffPath.desc}</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--primary)]">
              {fr ? staffPath.ctaFr : staffPath.cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Processus" : "How it works"}
            title={fr ? "De la découverte à la livraison" : "From browse to doorstep"}
            desc={fr ? PRODUCT_HERO.introFr : PRODUCT_HERO.intro}
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="step-card p-6">
                <div className="flex items-center justify-between">
                  <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold text-[var(--primary-tint)]">
                    {step.step}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-[var(--brand-red)]" />
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-display)] text-base font-bold text-slate-900">
                  {fr ? step.titleFr : step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{fr ? step.descFr : step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ECOSYSTEM / PORTALS ── */}
      <section id="portals" className="scroll-mt-20 landing-section-alt border-y border-[var(--border)] py-20">
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

      {/* ── STATS BAND ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {liveStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="big-stat text-gradient-brand text-5xl lg:text-6xl">{stat.value}</p>
                <p className="mt-3 text-sm font-semibold text-slate-600">{fr ? stat.labelFr : stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SELLER PLANS ── */}
      <section id="pricing" className="scroll-mt-20 landing-section-alt border-y border-[var(--border)] py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={fr ? "Vendeurs" : "For sellers"}
            title={fr ? "Vendez sur Somba&Teka" : "Sell on Somba&Teka"}
            desc={
              fr
                ? "Ouvrez votre boutique — choisissez un plan et commencez à vendre."
                : "Open your store — pick a plan and start selling to customers nationwide."
            }
          />
          {plansError ? (
            <p role="alert" className="mx-auto mt-12 max-w-md text-center text-sm text-red-700">
              {plansError}{" "}
              <button type="button" onClick={reloadPlans} className="font-medium underline">{fr ? "Réessayer" : "Retry"}</button>
            </p>
          ) : !plans ? (
            <p className="mx-auto mt-12 text-center text-sm text-slate-500">{fr ? "Chargement des plans…" : "Loading plans…"}</p>
          ) : (
          <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const features = (fr && plan.featuresFr?.length ? plan.featuresFr : plan.features) ?? [];
              const contact = plan.priceUsd === null;
              return (
              <div key={plan.id} className={cn("landing-pricing-card flex flex-col p-7", plan.popular && "landing-pricing-card--popular")}>
                <div className="flex items-center gap-2">
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">{fr && plan.nameFr ? plan.nameFr : plan.name}</h3>
                  {plan.popular && (
                    <span className="rounded-full bg-[var(--brand-red)] px-2 py-0.5 text-[10px] font-bold text-white">
                      {fr ? "Populaire" : "Popular"}
                    </span>
                  )}
                </div>
                <p className="mt-6 font-[family-name:var(--font-display)] text-4xl font-extrabold text-slate-900">
                  {contact ? (fr ? "Sur mesure" : "Custom") : plan.priceUsd === 0 ? (fr ? "Gratuit" : "Free") : `$${plan.priceUsd}`}
                  {!contact && (plan.priceUsd as number) > 0 && (
                    <span className="text-sm font-medium text-slate-500">/{plan.months === 1 ? (fr ? "mois" : "mo") : fr ? `${plan.months} mois` : `${plan.months} mo`}</span>
                  )}
                </p>
                {plan.maxProducts != null && (
                  <p className="mt-2 text-sm text-slate-500">{fr ? `Jusqu'à ${plan.maxProducts} produits` : `Up to ${plan.maxProducts} products`}</p>
                )}
                <ul className="mt-6 flex-1 space-y-2.5">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={contact ? APP_LINKS.contactSupport : "/sell-online"}
                  className={cn(
                    "mt-7 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold",
                    plan.popular ? "btn-primary" : "border border-slate-200 text-slate-800 hover:bg-slate-50"
                  )}
                >
                  {contact ? (fr ? "Nous contacter" : "Contact sales") : fr ? "Voir le plan" : "See the plan"}
                </Link>
              </div>
              );
            })}
          </div>
          )}
          <Link href="/sell-online" className="mx-auto mt-8 flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--primary)] hover:underline">
            {fr ? "En savoir plus sur la vente en ligne" : "Learn more about selling online"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="landing-section-alt border-t border-[var(--border)] py-20">
        <div className="mx-auto max-w-3xl px-4">
          <SectionIntro center label="FAQ" title={fr ? "Questions fréquentes" : "Common questions"} />
          <div className="mt-10">
            <FaqAccordion fr={fr} />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="landing-band py-24">
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg shadow-blue-950/20">
            <Image
              src="/brand/logo-stack.png"
              alt="Somba&Teka"
              width={96}
              height={96}
              priority
              className="h-full w-full scale-[1.3] object-contain"
            />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-balance lg:text-5xl">
            {fr ? "Prêt à acheter ou vendre ?" : "Ready to shop or sell?"}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-white/75">
            {fr
              ? "Parcourez les produits ou ouvrez votre boutique sur Somba&Teka."
              : "Browse the products or open your seller store on Somba&Teka."}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/shop/products"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-base font-bold text-[var(--primary)] shadow-xl shadow-blue-950/30 transition-all hover:-translate-y-0.5"
            >
              {fr ? "Acheter maintenant" : "Shop now"}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/sell-online" className="btn-outline-light inline-flex items-center px-10 py-4 text-base">
              {fr ? "Vendre en ligne" : "Sell online"}
            </Link>
          </div>
          {(APP_LINKS.ios || APP_LINKS.android) && (
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {APP_LINKS.ios && (
            <a
              href={APP_LINKS.ios}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white/90 ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/15"
            >
              <Smartphone className="h-4 w-4" /> App Store
            </a>
            )}
            {APP_LINKS.android && (
            <a
              href={APP_LINKS.android}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white/90 ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/15"
            >
              <Smartphone className="h-4 w-4" /> Google Play
            </a>
            )}
          </div>
          )}
        </div>
      </section>

      <MarketingFooter />
      <StickyCta />
    </div>
  );
}
