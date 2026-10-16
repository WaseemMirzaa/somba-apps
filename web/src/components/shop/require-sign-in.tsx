"use client";

import Link from "next/link";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";
import { PageLoader } from "@/components/ui/loader";

/**
 * Gate for shop pages that need an account (checkout, returns, support...).
 * An account is mandatory: visitors are sent to /shop/login and come back here.
 */
export function RequireSignIn({ children, next }: { children: React.ReactNode; next: string }) {
  const rt = useRealtime();
  const { locale } = useLocale();
  const fr = locale === "fr";

  if (rt.status !== "connected" && rt.status !== "error") return <PageLoader className="py-16" />;
  if (rt.user) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
        {fr ? "Connectez-vous pour continuer" : "Sign in to continue"}
      </h1>
      <p className="text-sm text-slate-500">
        {fr
          ? "Un compte est nécessaire pour commander, suivre vos commandes et contacter le support."
          : "An account is required to order, track your orders and contact support."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href={`/shop/login?next=${encodeURIComponent(next)}`} className="btn-primary px-6 py-2.5 text-sm">
          {fr ? "Se connecter" : "Sign in"}
        </Link>
        <Link href={`/shop/register?next=${encodeURIComponent(next)}`} className="rounded-xl border px-6 py-2.5 text-sm font-medium">
          {fr ? "Créer un compte" : "Create account"}
        </Link>
      </div>
    </div>
  );
}
