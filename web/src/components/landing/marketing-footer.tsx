"use client";

import Link from "next/link";
import { useLocale } from "@/context/locale-context";
import { BrandMark } from "@/components/landing/brand-mark";
import { BRAND, MARKET } from "@/lib/config";
import { APP_LINKS, PORTALS } from "@/lib/product-landing";
import { localizedField } from "@/lib/locale-helpers";

export function MarketingFooter() {
  const { locale, t } = useLocale();

  return (
    <footer className="relative border-t border-white/5 bg-[var(--sidebar)] text-slate-400">
      <div className="h-1 w-full bg-gradient-to-r from-[var(--primary)] via-[var(--brand-red)] to-[var(--primary)]" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <BrandMark tone="light" full className="mb-5" />
            <p className="max-w-sm text-sm leading-relaxed">
              {t("footerMarketplaceDesc")}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              {BRAND.legalEntity} · {BRAND.legalAddress}
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {t("shop")}
            </h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/shop/products" className="transition-colors hover:text-white">{t("allProducts")}</Link></li>
              <li><a href="#modules" className="transition-colors hover:text-white">{t("ourServices")}</a></li>
              <li><Link href="/sell-online" className="transition-colors hover:text-white">{t("sellOnline")}</Link></li>
              <li><a href="#portals" className="transition-colors hover:text-white">{t("aboutUs")}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {t("portals")}
            </h4>
            <ul className="space-y-3 text-sm">
              {PORTALS.map((p) => (
                <li key={p.id}>
                  <Link href="/login" className="transition-colors hover:text-white">
                    {localizedField(locale, p.name, p.nameFr)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {t("apps")}
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a href={APP_LINKS.ios} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                  iOS — {t("shopApp")}
                </a>
              </li>
              <li>
                <a href={APP_LINKS.android} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                  Android — {t("shopApp")}
                </a>
              </li>
              <li>
                <a href={APP_LINKS.customerApp} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                  {t("customerShopApp")}
                </a>
              </li>
              <li>
                <a href={APP_LINKS.riderApp} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                  {t("riderApp")}
                </a>
              </li>
              <li><Link href="/shop/products" className="transition-colors hover:text-white">{t("webShop")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
          <p className="text-sm">{BRAND.copyright}</p>
          <div className="flex gap-6 text-sm">
            <a href={APP_LINKS.contactSupport} className="hover:text-white">{t("support")}</a>
            <Link href="/login" className="hover:text-white">{t("login")}</Link>
            <span className="text-slate-600">{MARKET.currency}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
