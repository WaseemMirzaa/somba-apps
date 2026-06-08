"use client";

import Link from "next/link";
import { useLocale } from "@/context/locale-context";

export function LandingFooter() {
  const { t } = useLocale();

  return (
    <footer className="border-t border-white/5 bg-[var(--sidebar)] text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 text-sm font-bold text-white">
                LC
              </div>
              <span className="font-[family-name:var(--font-display)] text-xl font-bold text-white">
                {t("brand")}
              </span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed">{t("tagline")}</p>
            <p className="mt-3 inline-flex rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20">
              {t("prototypeDesc")}
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {t("footerShop")}
            </h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/shop/categories" className="transition-colors hover:text-white">{t("categories")}</Link></li>
              <li><Link href="/shop/products" className="transition-colors hover:text-white">{t("trending")}</Link></li>
              <li><Link href="/shop/search?q=flash" className="transition-colors hover:text-white">{t("flashSale")}</Link></li>
              <li><Link href="/shop/orders" className="transition-colors hover:text-white">{t("orders")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {t("footerSell")}
            </h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/seller" className="transition-colors hover:text-white">{t("sellerDashboard")}</Link></li>
              <li><Link href="/seller/products/create" className="transition-colors hover:text-white">{t("createProduct")}</Link></li>
              <li><Link href="/seller/analytics" className="transition-colors hover:text-white">{t("analytics")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {t("portals")}
            </h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/login" className="transition-colors hover:text-white">{t("adminPanel")}</Link></li>
              <li><Link href="/login" className="transition-colors hover:text-white">{t("sellerDashboard")}</Link></li>
              <li><Link href="/login" className="transition-colors hover:text-white">{t("warehousePortal")}</Link></li>
              <li><Link href="/login" className="transition-colors hover:text-white">{t("riderApp")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
          <p className="text-sm">© 2026 LipCart. {t("allRights")}</p>
          <div className="flex gap-6 text-sm">
            <Link href="/shop/account" className="hover:text-white">Account</Link>
            <Link href="/shop/support" className="hover:text-white">{t("support")}</Link>
            <Link href="/shop/account" className="hover:text-white">{t("settings")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
