"use client";

import Link from "next/link";
import { useLocale } from "@/context/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";

/** The 404 page (any URL that matches no route, or a page that calls notFound()), in the viewer's language. */
export default function NotFound() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <LanguageToggle className="absolute right-4 top-4" />
      <p className="text-6xl font-extrabold text-[var(--primary)]">404</p>
      <h1 className="text-xl font-bold text-slate-900">{fr ? "Page introuvable" : "Page not found"}</h1>
      <p className="max-w-md text-sm text-slate-500">
        {fr
          ? "Cette page n'existe pas ou a été déplacée. Vérifiez l'adresse ou revenez à l'accueil."
          : "This page does not exist or has moved. Check the address or go back to the home page."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md">
          {fr ? "Retour à l'accueil" : "Back to home"}
        </Link>
        <Link href="/shop" className="rounded-xl border border-[var(--border-strong)] bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          {fr ? "Voir la boutique" : "Visit the shop"}
        </Link>
      </div>
    </main>
  );
}
