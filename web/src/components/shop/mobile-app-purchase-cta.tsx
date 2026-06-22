"use client";

import { Smartphone } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { APP_LINKS } from "@/lib/product-landing";

export function MobileAppPurchaseCta() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-rose-50 p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
          <Smartphone className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-slate-900">
            {fr ? "Achetez sur l'application mobile" : "Purchase in the mobile app"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {fr
              ? "Les achats se font uniquement via l'app Somba & Teka. Téléchargez-la pour ajouter au panier, payer et suivre votre commande."
              : "Purchases are available only in the Somba & Teka app. Download it to add to cart, checkout, and track your order."}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={APP_LINKS.ios}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 sm:flex-none"
        >
          <Smartphone className="h-4 w-4" />
          App Store
        </a>
        <a
          href={APP_LINKS.android}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold sm:flex-none"
        >
          <Smartphone className="h-4 w-4" />
          Google Play
        </a>
      </div>
    </div>
  );
}
