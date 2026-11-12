"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLocale } from "@/context/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";

/** Shown when a page crashes while rendering. The technical message is never shown to the visitor. */
export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <LanguageToggle className="absolute right-4 top-4" />
      <h1 className="text-xl font-bold text-slate-900">{fr ? "Une erreur est survenue" : "Something went wrong"}</h1>
      <p className="max-w-md text-sm text-slate-500">
        {fr
          ? "Nous n'avons pas pu afficher cette page. Réessayez dans un instant ; si cela continue, contactez le support."
          : "We could not display this page. Try again in a moment; if it keeps happening, contact support."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => unstable_retry()} className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md">
          {fr ? "Réessayer" : "Try again"}
        </button>
        <Link href="/" className="rounded-xl border border-[var(--border-strong)] bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          {fr ? "Retour à l'accueil" : "Back to home"}
        </Link>
      </div>
    </main>
  );
}
