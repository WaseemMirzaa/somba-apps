"use client";

import Link from "next/link";
import { useLocale } from "@/context/locale-context";
import { BrandMark } from "@/components/landing/brand-mark";
import { BRAND, MARKET } from "@/lib/config";
import { APP_LINKS, PORTALS } from "@/lib/product-landing";

export function MarketingFooter() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <footer className="relative border-t border-white/5 bg-[var(--sidebar)] text-slate-400">
      <div className="h-1 w-full bg-gradient-to-r from-[var(--primary)] via-[var(--brand-red)] to-[var(--primary)]" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <BrandMark tone="light" full className="mb-5" />
            <p className="max-w-sm text-sm leading-relaxed">
              {fr
                ? "Votre marketplace en ligne — achetez des milliers de produits ou vendez sur Somba & Teka."
                : "Your online marketplace — shop thousands of products or sell on Somba & Teka."}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              {BRAND.legalEntity} · {BRAND.legalAddress}
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {fr ? "Boutique" : "Shop"}
            </h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/get-app" className="transition-colors hover:text-white">{fr ? "Tous les produits" : "All products"}</Link></li>
              <li><a href="#modules" className="transition-colors hover:text-white">{fr ? "Nos services" : "Our services"}</a></li>
              <li><Link href="/sell-online" className="transition-colors hover:text-white">{fr ? "Vendre en ligne" : "Sell online"}</Link></li>
              <li><a href="#portals" className="transition-colors hover:text-white">{fr ? "À propos" : "About us"}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {fr ? "Portails" : "Portals"}
            </h4>
            <ul className="space-y-3 text-sm">
              {PORTALS.map((p) => (
                <li key={p.id}>
                  <Link href="/login" className="transition-colors hover:text-white">
                    {fr ? p.nameFr : p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              {fr ? "Applications" : "Apps"}
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a href={APP_LINKS.ios} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                  iOS — {fr ? "App boutique" : "Shop app"}
                </a>
              </li>
              <li>
                <a href={APP_LINKS.android} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                  Android — {fr ? "App boutique" : "Shop app"}
                </a>
              </li>
              <li>
                <a href={APP_LINKS.customerApp} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                  {fr ? "App boutique client" : "Customer shop app"}
                </a>
              </li>
              <li>
                <a href={APP_LINKS.riderApp} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                  {fr ? "App livreur" : "Rider app"}
                </a>
              </li>
              <li><Link href="/get-app" className="transition-colors hover:text-white">{fr ? "Acheter sur l'app" : "Shop on the app"}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
          <p className="text-sm">{BRAND.copyright}</p>
          <div className="flex gap-6 text-sm">
            <a href={APP_LINKS.contactSupport} className="hover:text-white">{fr ? "Support" : "Support"}</a>
            <Link href="/login" className="hover:text-white">{fr ? "Connexion" : "Login"}</Link>
            <span className="text-slate-600">{MARKET.currency}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
