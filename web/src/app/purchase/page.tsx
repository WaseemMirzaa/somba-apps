"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { BRAND } from "@/lib/config";

/** Legacy route — redirects sellers to homepage pricing; shoppers to shop */
export default function PurchasePage() {
  const { t } = useLocale();

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.replace("/sell-online");
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4 text-center">
      <p className="text-sm text-slate-500">{t("redirecting")}</p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
        {t("sellOnBrand")} {BRAND.fullName}
      </h1>
      <p className="mt-2 max-w-md text-slate-600">{t("purchaseMarketplaceDesc")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/sell-online" className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm">
          {t("sellOnline")}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href="/shop/products" className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold hover:bg-slate-50">
          {t("shopInstead")}
        </Link>
      </div>
    </div>
  );
}
