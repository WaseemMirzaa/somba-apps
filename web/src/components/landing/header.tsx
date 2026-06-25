"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ShoppingCart, User, Menu, X, Heart } from "lucide-react";
import { NotificationBell } from "@/components/ui/notification-bell";
import { SearchAutocomplete } from "@/components/shop/search-autocomplete";
import { useMarket } from "@/context/market-context";
import { useState, FormEvent } from "react";
import { useLocale } from "@/context/locale-context";
import { PortalSwitcher } from "@/components/layout/portal-switcher";
import { BrandMark } from "@/components/landing/brand-mark";
import { useShop } from "@/context/shop-context";
import { cn } from "@/lib/utils";

export function LandingHeader() {
  const { t, locale, setLocale } = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { cartCount } = useShop();
  const { profileId, setProfileId } = useMarket();

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim() || "phone";
    router.push(`/shop/search?q=${encodeURIComponent(q)}`);
    setMobileOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 glass border-b border-[var(--border)]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-[72px] items-center gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <BrandMark wordClassName="hidden sm:block" />
          </Link>

          <form onSubmit={handleSearch} className="hidden flex-1 md:flex max-w-2xl">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="input-premium w-full py-3 pl-11 pr-4 text-sm shadow-sm"
              />
              <SearchAutocomplete query={query} onSelect={() => setMobileOpen(false)} />
            </div>
          </form>

          <div className="hidden items-center gap-2 lg:flex">
            <PortalSwitcher compact />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <div className="hidden items-center gap-1 rounded-xl border border-[var(--border)] bg-slate-50 p-1 sm:flex">
              <button
                onClick={() => setLocale("en")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                  locale === "en" ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-500"
                )}
              >
                EN
              </button>
              <button
                onClick={() => setLocale("fr")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                  locale === "fr" ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-500"
                )}
              >
                FR
              </button>
            </div>

            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value as "france" | "drc")}
              className="hidden rounded-lg border border-[var(--border)] bg-slate-50 px-2 py-1 text-xs font-medium lg:block"
              title={locale === "fr" ? "Profil de marché" : "Market profile"}
            >
              <option value="france">FR</option>
              <option value="drc">DRC</option>
            </select>
            <NotificationBell portal="customer" href="/shop/notifications" className="hidden sm:flex" />
            <Link href="/login" className="hidden rounded-xl px-3 py-2 text-xs font-semibold text-[var(--primary)] hover:bg-blue-50 sm:block">
              {locale === "fr" ? "Connexion" : "Login"}
            </Link>
            <Link
              href="/shop/account"
              className="hidden rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[var(--primary)] sm:block"
              title={t("myAccount")}
            >
              <User className="h-5 w-5" />
            </Link>
            <Link
              href="/shop/wishlist"
              className="hidden rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-500 sm:block"
            >
              <Heart className="h-5 w-5" />
            </Link>
            <Link
              href="/shop/cart"
              className="relative rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[var(--primary)]"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>

            <button
              className="rounded-xl p-2.5 md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="-mx-4 bg-[var(--primary)] px-4 py-4 md:hidden">
            <form onSubmit={handleSearch} className="mb-4">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="input-premium w-full px-4 py-2.5 text-sm"
              />
            </form>
            <div className="mb-4 overflow-x-auto">
              <PortalSwitcher compact />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLocale("en")}
                className={cn("flex-1 rounded-xl py-2.5 text-sm font-medium", locale === "en" ? "bg-white text-[var(--primary)]" : "border border-white/30 text-white")}
              >
                EN
              </button>
              <button
                onClick={() => setLocale("fr")}
                className={cn("flex-1 rounded-xl py-2.5 text-sm font-medium", locale === "fr" ? "bg-white text-[var(--primary)]" : "border border-white/30 text-white")}
              >
                FR
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <Link href="/shop/account" className="flex-1 rounded-xl border border-white/30 py-2.5 text-center text-sm text-white">
                {t("myAccount")}
              </Link>
              <Link href="/seller" className="flex-1 rounded-xl border border-white/30 py-2.5 text-center text-sm text-white">
                {t("becomeSeller")}
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] bg-slate-50/50">
        <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-2.5 text-sm">
          <Link href="/shop/categories" className="whitespace-nowrap font-semibold text-slate-800 hover:text-[var(--primary)]">
            {t("categories")}
          </Link>
          <Link href="/shop/products" className="whitespace-nowrap text-slate-600 hover:text-[var(--primary)]">
            {t("trending")}
          </Link>
          <Link href="/shop/deals" className="whitespace-nowrap text-slate-600 hover:text-[var(--primary)]">
            {t("flashSale")}
          </Link>
          <Link href="/seller" className="whitespace-nowrap text-slate-600 hover:text-[var(--primary)]">
            {t("becomeSeller")}
          </Link>
          <span className="ml-auto whitespace-nowrap text-xs font-medium text-amber-600">
            ? {t("prototype")}
          </span>
        </div>
      </div>
    </header>
  );
}
