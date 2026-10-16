"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Ban, Clock, Store } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { PageLoader } from "@/components/ui/loader";
import { useStoreGate } from "@/lib/seller";

/** Pages a store that is still waiting for approval may open. */
const PENDING_OK = ["/seller/pending", "/seller/settings", "/seller/support", "/seller/subscribe"];
/** Pages a rejected / suspended store may open (to talk to support). */
const BLOCKED_OK = ["/seller/support"];

const onPath = (pathname: string, list: string[]) =>
  list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Gates the whole seller portal on the REAL store state (`sellers:mine`):
 * no store → registration, pending → waiting page, rejected / suspended →
 * explanation + support, approved → the portal. There is no browser-only
 * subscription gate any more.
 */
export function SellerStoreGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { state, seller } = useStoreGate();

  const redirectTo =
    state === "none"
      ? "/seller/register"
      : state === "pending" && !onPath(pathname, PENDING_OK)
        ? "/seller/pending"
        : state === "approved" && pathname === "/seller/pending"
          ? "/seller"
          : null;

  useEffect(() => {
    if (redirectTo && redirectTo !== pathname) router.replace(redirectTo);
  }, [redirectTo, pathname, router]);

  if (rt.user?.role !== "seller" || state === "loading") return <PageLoader locale={locale} />;
  if (redirectTo && redirectTo !== pathname) return <PageLoader locale={locale} />;

  if ((state === "rejected" || state === "suspended") && !onPath(pathname, BLOCKED_OK)) {
    const suspended = state === "suspended";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
        <div className="max-w-md space-y-4 rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            {suspended ? <Ban className="h-7 w-7 text-red-600" /> : <Store className="h-7 w-7 text-red-600" />}
          </span>
          <h1 className="text-xl font-bold text-slate-900">
            {suspended
              ? fr ? "Boutique suspendue" : "Store suspended"
              : fr ? "Inscription refusée" : "Registration rejected"}
          </h1>
          <p className="text-sm text-slate-600">
            {suspended
              ? fr
                ? `Votre boutique « ${seller?.name} » a été suspendue par la modération. Vos produits ne sont plus visibles et vous ne pouvez plus publier ni demander de versement.`
                : `Your store "${seller?.name}" was suspended by moderation. Your listings are hidden and you cannot publish products or request payouts.`
              : fr
                ? `La demande d'ouverture de « ${seller?.name} » a été refusée par la modération.`
                : `The application for "${seller?.name}" was rejected by moderation.`}
          </p>
          <p className="text-xs text-slate-500">
            {fr
              ? "Le motif n'est pas affiché ici : écrivez au support pour le connaître et discuter d'une réactivation."
              : "The reason is not shown here: contact support to find out why and to discuss reinstatement."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/seller/support" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
              {fr ? "Contacter le support" : "Contact support"}
            </Link>
            <a href="mailto:support@somba.com" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              support@somba.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {state === "pending" && pathname !== "/seller/pending" && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <Clock className="h-4 w-4 shrink-0" />
          {fr
            ? "Votre boutique attend l'approbation de la modération : les autres pages du portail sont verrouillées."
            : "Your store is waiting for moderation approval: the other portal pages are locked."}
        </div>
      )}
      {children}
    </>
  );
}
