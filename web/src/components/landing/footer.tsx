"use client";

import Link from "next/link";
import { useLocale } from "@/context/locale-context";
import { BrandMark } from "@/components/landing/brand-mark";
import { BRAND, LEGAL_LINKS } from "@/lib/config";

export function LandingFooter() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <footer className="border-t border-white/5 bg-[var(--sidebar)] text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="mb-5">
              <BrandMark tone="light" full wordClassName="text-white" />
            </div>
            <p className="max-w-sm text-sm leading-relaxed">{t("tagline")}</p>
            <p className="mt-4 text-xs text-slate-500">
              {BRAND.legalEntity} · {BRAND.legalAddress}
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {t("footerShop")}
            </h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/shop/categories" className="transition-colors hover:text-white">{t("categories")}</Link></li>
              <li><Link href="/shop/products" className="transition-colors hover:text-white">{fr ? "Tous les produits" : "All products"}</Link></li>
              <li><Link href="/shop/deals" className="transition-colors hover:text-white">{t("flashSale")}</Link></li>
              <li><Link href="/shop/orders" className="transition-colors hover:text-white">{t("orders")}</Link></li>
              <li><Link href="/shop/help" className="transition-colors hover:text-white">{fr ? "Aide" : "Help"}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {t("footerSell")}
            </h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/sell-online" className="transition-colors hover:text-white">{fr ? "Vendre en ligne" : "Sell online"}</Link></li>
              <li><Link href="/seller" className="transition-colors hover:text-white">{t("sellerDashboard")}</Link></li>
              <li><Link href="/login" className="transition-colors hover:text-white">{fr ? "Connexion équipe" : "Staff login"}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 lg:flex-row">
          <p className="text-sm">{fr ? BRAND.copyrightFr : BRAND.copyright}</p>
          <nav aria-label={fr ? "Mentions légales" : "Legal"} className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-white">{fr ? l.labelFr : l.label}</Link>
            ))}
          </nav>
          <div className="flex gap-6 text-sm">
            <Link href="/shop/account" className="hover:text-white">{t("myAccount")}</Link>
            <Link href="/shop/support" className="hover:text-white">{t("support")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
