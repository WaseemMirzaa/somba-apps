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
  Quote,
  Clock,
  Users,
  TrendingUp,
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
import { localizedField } from "@/lib/locale-helpers";
import type { TranslationKey } from "@/lib/i18n";
import {
  APP_LINKS,
  SELLER_PLANS,
  PLATFORM_STATS,
  PRODUCT_HERO,
  CONVERSION_PATHS,
  HOW_IT_WORKS,
  TESTIMONIALS,
  PORTAL_SECTION,
  MODULES_SECTION,
  PLATFORM_MODULES,
} from "@/lib/product-landing";
import { BRAND } from "@/lib/config";
import { categories, products } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import type { UserRole } from "@/lib/portal-access";
import { cn } from "@/lib/utils";

const MODULE_ICONS = {
  fulfillment: Truck,
  cod: ShieldCheck,
  returns: RotateCcw,
  subscription: Store,
} as const;

const MARQUEE_ITEMS: { icon: typeof Truck; key: TranslationKey }[] = [
  { icon: Truck, key: "marqueeDelivery13" },
  { icon: ShieldCheck, key: "marqueeBuyerProtection" },
  { icon: RotateCcw, key: "marquee30DayReturns" },
  { icon: Wallet, key: "marqueePaymentMethods" },
  { icon: BadgeCheck, key: "verifiedSellers" },
  { icon: Headphones, key: "marquee247Support" },
  { icon: Globe, key: "marqueeBilingual" },
];

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
  const { locale, t } = useLocale();
  const { persona, isAuthenticated, authReady } = useAuth();
  const router = useRouter();
  const role = persona.role as UserRole;
  const [explorePortal, setExplorePortal] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [showBar, setShowBar] = useState(true);

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
  const heroBullets = locale === "fr" ? PRODUCT_HERO.bulletsFr : PRODUCT_HERO.bullets;

  return (
    <div className="min-h-screen bg-white">
      {/* ── ANNOUNCEMENT BAR ── */}
      {showBar && (
        <div className="announce-bar relative z-[60]">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-10 py-2 text-center text-xs font-medium sm:text-sm">
            <Sparkles className="hidden h-4 w-4 sm:block" />
            <span>{t("freeDeliveryFirstOrder")}</span>
            <Link href="/shop/products" className="font-bold underline underline-offset-2">
              {t("shopNowArrow")}
            </Link>
            <button
              onClick={() => setShowBar(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/80 hover:bg-white/15 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
              {BRAND.fullName} · {t("onlineMarketplace")}
            </span>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[1.02] tracking-tight text-slate-900 text-balance sm:text-6xl lg:text-[4.25rem]">
              {t("shopSmarter")}
              <br />
              <span className="text-gradient-brand">{t("deliveredFaster")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              {localizedField(locale, PRODUCT_HERO.subtitle, PRODUCT_HERO.subtitleFr)}
            </p>

            {/* Search */}
            <form onSubmit={submitSearch} className="relative mt-8 max-w-xl">
              <div className="hero-search flex items-center gap-2 p-2 pl-4">
                <Search className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchCategoriesPlaceholder")}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  aria-label={t("search")}
                />
                <button type="submit" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
                  <Search className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{t("search")}</span>
                </button>
              </div>
              <SearchAutocomplete query={query} onSelect={() => setQuery("")} />
            </form>

            {/* Quick categories */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">{t("popularColon")}</span>
              {categories.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href="/shop/products"
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-[var(--primary-tint)] hover:text-[var(--primary)]"
                >
                  {localizedField(locale, c.name, c.nameFr)}
                </Link>
              ))}
            </div>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/shop/products" className="btn-primary inline-flex items-center gap-2 px-7 py-3.5 text-base">
                {t("browseProducts")}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/sell-online"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                {t("sellOnSomba")}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Trust row */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {["AB", "MD", "SL"].map((i, idx) => (
                    <span
                      key={i}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white",
                        idx === 0 ? "bg-[var(--primary)]" : idx === 1 ? "bg-[var(--brand-red)]" : "bg-slate-700"
                      )}
                    >
                      {i}
                    </span>
                  ))}
                </div>
                <div className="text-sm">
                  <span className="flex items-center gap-1 font-bold text-slate-900">
                    4.8 <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  </span>
                  <span className="text-xs text-slate-500">{t("happyShoppers48k")}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                <BadgeCheck className="h-4 w-4 text-[var(--primary)]" />
                {t("verifiedSellers")}
              </span>
            </div>
          </div>

          {/* Right — showcase bento */}
          <div className="relative hidden lg:block animate-rise delay-200">
            <div className="grid h-[540px] grid-cols-2 grid-rows-2 gap-4">
              {/* Featured large product */}
              <Link href={`/shop/products/${heroProducts[1].id}`} className="showcase-card group row-span-2 flex flex-col bg-white">
                <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-[var(--primary-light)]">
                  <Image
                    src={heroProducts[1].image}
                    alt={localizedField(locale, heroProducts[1].name, heroProducts[1].nameFr)}
                    fill
                    preload
                    sizes="320px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-[var(--brand-red)] px-2.5 py-1 text-[10px] font-bold text-white shadow">
                    -{heroProducts[1].discount}%
                  </span>
                </div>
                <div className="p-4">
                  <p className="line-clamp-1 text-sm font-bold text-slate-900">{localizedField(locale, heroProducts[1].name, heroProducts[1].nameFr)}</p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--primary)]">
                    {formatCurrency(heroProducts[1].price, locale)}
                  </p>
                </div>
              </Link>

              {/* Secondary product */}
              <Link href={`/shop/products/${heroProducts[0].id}`} className="showcase-card group flex flex-col bg-white">
                <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-[var(--primary-light)]">
                  <Image
                    src={heroProducts[0].image}
                    alt={localizedField(locale, heroProducts[0].name, heroProducts[0].nameFr)}
                    fill
                    sizes="240px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 text-xs font-bold text-slate-900">{localizedField(locale, heroProducts[0].name, heroProducts[0].nameFr)}</p>
                  <p className="mt-0.5 text-sm font-extrabold text-[var(--primary)]">{formatCurrency(heroProducts[0].price, locale)}</p>
                </div>
              </Link>

              {/* Offer tile */}
              <Link
                href="/shop/products"
                className="showcase-card group relative flex flex-col justify-between bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] p-5 text-white"
              >
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-white/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-red)] animate-pulse" />
                  {t("flashDeals")}
                </span>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold">−50%</p>
                  <p className="text-sm text-white/80">{t("onSelectedItems")}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-bold">
                    {t("shopCta")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </div>

            {/* Floating chips */}
            <div className="showcase-chip float-a absolute -left-6 top-12 flex items-center gap-2 px-3.5 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              </span>
              <div>
                <p className="text-sm font-extrabold leading-none text-slate-900">4.8 / 5</p>
                <p className="text-[11px] text-slate-500">{t("reviews12k")}</p>
              </div>
            </div>
            <div className="showcase-chip float-b absolute -bottom-5 right-6 flex items-center gap-2 px-3.5 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-light)]">
                <Truck className="h-4 w-4 text-[var(--primary)]" />
              </span>
              <div>
                <p className="text-sm font-extrabold leading-none text-slate-900">{t("fastDelivery")}</p>
                <p className="text-[11px] text-slate-500">{t("days13")}</p>
              </div>
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
                  {t(m.key)}
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
              <span className="section-label">{t("categories")}</span>
              <h2 className="section-title mt-3 text-3xl">{t("shopByCategory")}</h2>
            </div>
            <Link href="/shop/products" className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline sm:inline-flex">
              {t("viewAll")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="cat-rail mt-8">
            {categories.map((cat) => (
              <Link key={cat.id} href="/shop/products" className="cat-tile group">
                <div className="relative aspect-[5/4] overflow-hidden">
                  <Image
                    src={cat.image}
                    alt={localizedField(locale, cat.name, cat.nameFr)}
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
                  {localizedField(locale, cat.name, cat.nameFr)}
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
              label={t("trendingSelection")}
              title={t("trendingThisWeek")}
              desc={t("trendingDesc")}
            />
            <Link href="/shop/products" className="mb-1 hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline sm:inline-flex">
              {t("fullShop")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
            {products.slice(0, 8).map((p) => (
              <Link key={p.id} href={`/shop/products/${p.id}`} className="pcard group block">
                <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-50 to-[var(--primary-light)]">
                  <Image
                    src={p.image}
                    alt={localizedField(locale, p.name, p.nameFr)}
                    fill
                    sizes="(max-width: 1024px) 50vw, 280px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {p.discount > 0 && (
                    <span className="absolute left-3 top-3 rounded-lg bg-[var(--brand-red)] px-2.5 py-1 text-xs font-bold text-white shadow-md">
                      -{p.discount}%
                    </span>
                  )}
                  <span className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-xs font-bold text-amber-600 shadow-sm">
                    <Star className="h-3 w-3 fill-current" />
                    {p.rating}
                  </span>
                </div>
                <div className="p-4">
                  <p className="line-clamp-1 text-sm font-bold text-slate-900 group-hover:text-[var(--primary)]">{localizedField(locale, p.name, p.nameFr)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{p.seller}</p>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[var(--primary)]">
                      {formatCurrency(p.price, locale)}
                    </span>
                    {p.originalPrice > p.price && (
                      <span className="text-xs text-slate-400 line-through">{formatCurrency(p.originalPrice, locale)}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── VALUE BENTO ── */}
      <section id="modules" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={t("whySomba")}
            title={localizedField(locale, MODULES_SECTION.title, MODULES_SECTION.titleFr)}
            desc={localizedField(locale, MODULES_SECTION.subtitle, MODULES_SECTION.subtitleFr)}
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
                        alt={localizedField(locale, mod.name, mod.nameFr)}
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
                          {localizedField(locale, mod.highlight, mod.highlightFr)}
                        </span>
                        <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-extrabold">{localizedField(locale, mod.name, mod.nameFr)}</h3>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85">{localizedField(locale, mod.desc, mod.descFr)}</p>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold">
                          {localizedField(locale, mod.cta, mod.ctaFr)}
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
                          {localizedField(locale, mod.name, mod.nameFr)}
                        </h3>
                        <span className="rounded-full bg-[var(--brand-red-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--brand-red)]">
                          {localizedField(locale, mod.highlight, mod.highlightFr)}
                        </span>
                      </div>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{localizedField(locale, mod.desc, mod.descFr)}</p>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--primary)]">
                        {localizedField(locale, mod.cta, mod.ctaFr)}
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
            label={t("whereToStart")}
            title={t("shopOrSellTitle")}
            desc={t("shopOrSellDesc")}
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {/* Shop panel */}
            <div className="split-panel flex flex-col bg-white p-8 lg:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
                <ShoppingBag className="h-6 w-6" />
              </span>
              <h3 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-extrabold text-slate-900">
                {localizedField(locale, shopPath.title, shopPath.titleFr)}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">{localizedField(locale, shopPath.desc, shopPath.descFr)}</p>
              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {heroBullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link href={shopPath.href} className="btn-primary mt-8 inline-flex w-fit items-center gap-2 px-7 py-3.5 text-base">
                {localizedField(locale, shopPath.cta, shopPath.ctaFr)}
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>

            {/* Sell panel */}
            <div className="split-panel split-panel--dark flex flex-col p-8 lg:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <Store className="h-6 w-6" />
              </span>
              <h3 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-extrabold">
                {localizedField(locale, sellPath.title, sellPath.titleFr)}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">{localizedField(locale, sellPath.desc, sellPath.descFr)}</p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
                  <Clock className="h-3.5 w-3.5" /> {t("liveIn24h")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
                  <Users className="h-3.5 w-3.5" /> {t("customers48k")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
                  <TrendingUp className="h-3.5 w-3.5" /> {t("from49mo")}
                </span>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={sellPath.href}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-bold text-[var(--primary)] shadow-lg transition-all hover:-translate-y-0.5"
                >
                  {localizedField(locale, sellPath.cta, sellPath.ctaFr)}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/sell-online" className="text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
                  {t("viewPlans")}
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
                <p className="font-bold text-slate-900">{localizedField(locale, staffPath.title, staffPath.titleFr)}</p>
                <p className="text-sm text-slate-500">{localizedField(locale, staffPath.desc, staffPath.descFr)}</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--primary)]">
              {localizedField(locale, staffPath.cta, staffPath.ctaFr)}
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
            label={t("howItWorks")}
            title={t("fromBrowseToDoorstep")}
            desc={localizedField(locale, PRODUCT_HERO.intro, PRODUCT_HERO.introFr)}
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
                  {localizedField(locale, step.title, step.titleFr)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{localizedField(locale, step.desc, step.descFr)}</p>
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
            label={t("ecosystem")}
            title={localizedField(locale, PORTAL_SECTION.title, PORTAL_SECTION.titleFr)}
            desc={localizedField(locale, PORTAL_SECTION.subtitle, PORTAL_SECTION.subtitleFr)}
          />
          <div className="mt-14">
            <PortalOverviewCards
              locale={locale}
              role={role}
              isAuthenticated={isAuthenticated}
              authReady={authReady}
              personaPortal={persona.portal}
              onExplorePortal={handleExplorePortal}
            />
          </div>
          <div className="mt-16">
            <PortalExplorer
              locale={locale}
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
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {PLATFORM_STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="big-stat text-gradient-brand text-5xl lg:text-6xl">{stat.value}</p>
                <p className="mt-3 text-sm font-semibold text-slate-500">{localizedField(locale, stat.label, stat.labelFr)}</p>
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
            label={t("forSellers")}
            title={t("sellOnSombaTekka")}
            desc={t("sellPlansDesc")}
          />
          <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
            {SELLER_PLANS.map((plan) => (
              <div key={plan.id} className={cn("landing-pricing-card flex flex-col p-7", plan.popular && "landing-pricing-card--popular")}>
                <div className="flex items-center gap-2">
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">{plan.name}</h3>
                  {plan.popular && (
                    <span className="rounded-full bg-[var(--brand-red)] px-2 py-0.5 text-[10px] font-bold text-white">
                      {t("popular")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-500">{plan.desc}</p>
                <p className="mt-6 font-[family-name:var(--font-display)] text-4xl font-extrabold text-slate-900">
                  {plan.price !== null ? `$${plan.price}` : t("custom")}
                  {plan.price !== null && <span className="text-sm font-medium text-slate-500">/mo</span>}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.id === "enterprise" ? APP_LINKS.contactSupport : "/login"}
                  className={cn(
                    "mt-7 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold",
                    plan.popular ? "btn-primary" : "border border-slate-200 text-slate-800 hover:bg-slate-50"
                  )}
                >
                  {plan.id === "enterprise" ? t("contactSales") : t("subscribe")}
                </Link>
              </div>
            ))}
          </div>
          <Link href="/sell-online" className="mx-auto mt-8 flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--primary)] hover:underline">
            {t("learnMoreSelling")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <SectionIntro
            center
            label={t("testimonials")}
            title={t("lovedByShoppers")}
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <div key={item.name} className="landing-testimonial p-7">
                <Quote className="absolute right-5 top-5 h-9 w-9 text-[var(--primary-tint)]" />
                <div className="flex gap-1 text-amber-400">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">&ldquo;{localizedField(locale, item.quote, item.quoteFr)}&rdquo;</p>
                <div className="mt-6 flex items-center gap-3 border-t border-[var(--border)] pt-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] text-xs font-bold text-white shadow-md">
                    {item.initials}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">{localizedField(locale, item.role, item.roleFr)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="landing-section-alt border-t border-[var(--border)] py-20">
        <div className="mx-auto max-w-3xl px-4">
          <SectionIntro center label="FAQ" title={t("commonQuestions")} />
          <div className="mt-10">
            <FaqAccordion />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="landing-band py-24">
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <ShoppingBag className="h-7 w-7 text-white" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-balance lg:text-5xl">
            {t("readyToShopOrSell")}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-white/75">
            {t("readyToShopOrSellDesc")}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/shop/products"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-base font-bold text-[var(--primary)] shadow-xl shadow-blue-950/30 transition-all hover:-translate-y-0.5"
            >
              {t("shopNowCta")}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/sell-online" className="btn-outline-light inline-flex items-center px-10 py-4 text-base">
              {t("sellOnline")}
            </Link>
          </div>
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
