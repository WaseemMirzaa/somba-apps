"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { BRAND } from "@/lib/config";
import { InlineLoader } from "@/components/ui/loader";

/** Legacy route — redirects sellers to homepage pricing; shoppers to shop */
export default function PurchasePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.replace("/sell-online");
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4 text-center">
      <InlineLoader
        locale={locale}
        label="Redirecting…"
        labelFr="Redirection…"
      />
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
        {fr ? `Vendre sur ${BRAND.fullName}` : `Sell on ${BRAND.fullName}`}
      </h1>
      <p className="mt-2 max-w-md text-slate-600">
        {fr
          ? "Somba & Tekka est une marketplace — consultez nos plans vendeur pour ouvrir votre boutique."
          : "Somba & Tekka is a marketplace — see our seller plans to open your store."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/sell-online" className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm">
          {fr ? "Vendre en ligne" : "Sell online"}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href="/shop/products" className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold hover:bg-slate-50">
          {fr ? "Acheter" : "Shop instead"}
        </Link>
      </div>
    </div>
  );
}
