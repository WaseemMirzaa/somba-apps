"use client";

import { Smartphone } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { APP_LINKS } from "@/lib/product-landing";

export function MobileAppPurchaseCta() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  // No store links configured yet: nothing to advertise.
  if (!APP_LINKS.ios && !APP_LINKS.android) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
          <Smartphone className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-900">
            {fr ? "Préférez-vous l'application mobile ?" : "Prefer the mobile app?"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {fr
              ? "Commandez aussi depuis l'application Somba&Teka : même compte, suivi en direct."
              : "You can also order from the Somba&Teka app: same account, same orders, live tracking."}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {APP_LINKS.ios && <a
          href={APP_LINKS.ios}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 sm:flex-none"
        >
          <Smartphone className="h-4 w-4" />
          App Store
        </a>}
        {APP_LINKS.android && <a
          href={APP_LINKS.android}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold sm:flex-none"
        >
          <Smartphone className="h-4 w-4" />
          Google Play
        </a>}
      </div>
    </div>
  );
}
