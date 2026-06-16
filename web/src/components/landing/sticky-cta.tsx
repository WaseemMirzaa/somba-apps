"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useLocale } from "@/context/locale-context";

export function StickyCta() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-white/95 p-4 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md md:bottom-6 md:left-auto md:right-6 md:max-w-md md:rounded-2xl md:border">
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label={fr ? "Fermer" : "Dismiss"}
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 font-[family-name:var(--font-display)] text-sm font-bold text-slate-900">
        {fr ? "Des milliers de produits vous attendent" : "Thousands of products await"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {fr ? "Livraison rapide · Paiement sécurisé · Retours faciles" : "Fast delivery · Secure checkout · Easy returns"}
      </p>
      <div className="mt-3 flex gap-2">
        <Link href="/get-app" className="btn-primary flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm">
          {fr ? "Acheter" : "Shop now"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/sell-online"
          className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {fr ? "Vendre en ligne" : "Sell online"}
        </Link>
      </div>
    </div>
  );
}
