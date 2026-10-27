"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Ban, Clock, Store, Users } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { localDateTime } from "@/lib/dates";
import { useRealtime } from "@/context/realtime-context";
import { useAuth } from "@/context/auth-context";
import { PageLoader } from "@/components/ui/loader";
import { useStoreGate } from "@/lib/seller";

/** Pages a store that is still waiting for approval may open. */
const PENDING_OK = ["/seller/pending", "/seller/resubmit", "/seller/settings", "/seller/support", "/seller/subscribe"];
/** Pages a pending store that never filed its KYC may open (the form, plus help). */
const KYC_OK = ["/seller/resubmit", "/seller/settings", "/seller/support"];
/** Pages a rejected store may open: fix and resubmit, or talk to support. */
const REJECTED_OK = ["/seller/resubmit", "/seller/support"];
/** Pages a suspended store may open (to talk to support; a suspension cannot be resubmitted). */
const SUSPENDED_OK = ["/seller/support"];

const onPath = (pathname: string, list: string[]) =>
  list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Gates the whole seller portal on the REAL store state (`sellers:mine`):
 * no store → registration, pending → waiting page (or the KYC form when the
 * store never filed one), rejected → the reason + "fix and resubmit", suspended →
 * the reason + support, approved → the portal. There is no browser-only
 * subscription gate any more.
 */
export function SellerStoreGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { state, seller, removedFrom } = useStoreGate();
  const { logout } = useAuth();

  // A store opened before KYC existed: complete it before waiting for approval.
  const needsKyc = state === "pending" && !!seller && !seller.kycSubmittedAt;

  const redirectTo =
    state === "removed"
      ? null
      : state === "none"
      ? "/seller/register"
      : needsKyc
        ? onPath(pathname, KYC_OK) ? null : "/seller/resubmit"
        : state === "pending" && !onPath(pathname, PENDING_OK)
          ? "/seller/pending"
          : state === "pending" && pathname === "/seller/resubmit"
            ? "/seller/pending"
            : state === "approved" && (pathname === "/seller/pending" || pathname === "/seller/resubmit")
              ? "/seller"
              : null;

  useEffect(() => {
    if (redirectTo && redirectTo !== pathname) router.replace(redirectTo);
  }, [redirectTo, pathname, router]);

  if (rt.user?.role !== "seller" || state === "loading") return <PageLoader locale={locale} />;
  if (redirectTo && redirectTo !== pathname) return <PageLoader locale={locale} />;

  // The owner took this account off the team: say so (the portal's data is gone), then offer the next steps.
  if (state === "removed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
        <div className="max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" data-testid="team-removed">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Users className="h-7 w-7 text-slate-600" />
          </span>
          <h1 className="text-xl font-bold text-slate-900">{fr ? "Vous ne faites plus partie de l'équipe" : "You are no longer on the team"}</h1>
          <p className="text-sm text-slate-600">
            {fr
              ? `Le propriétaire de « ${removedFrom || "la boutique"} » a retiré votre accès. Vos données personnelles restent sur votre compte.`
              : `The owner of "${removedFrom || "the store"}" removed your access. Your personal data stays on your account.`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => logout()} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
              {fr ? "Se déconnecter" : "Sign out"}
            </button>
            <Link href="/seller/register" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              {fr ? "Ouvrir ma propre boutique" : "Open my own store"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if ((state === "rejected" && !onPath(pathname, REJECTED_OK)) || (state === "suspended" && !onPath(pathname, SUSPENDED_OK))) {
    const suspended = state === "suspended";
    const changedAt = seller?.statusChangedAt ? localDateTime(seller.statusChangedAt) : null;
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
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-left text-sm text-red-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{fr ? "Motif communiqué par la modération" : "Reason given by moderation"}</p>
            <p className="mt-1 whitespace-pre-line break-words">
              {seller?.statusReason || (fr ? "Aucun motif n'a été indiqué." : "No reason was given.")}
            </p>
            {changedAt && <p className="mt-1 text-xs text-red-700">{changedAt}</p>}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {!suspended && (
              <Link href="/seller/resubmit" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
                {fr ? "Corriger et renvoyer" : "Fix and resubmit"}
              </Link>
            )}
            <Link
              href="/seller/support"
              className={suspended ? "rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white" : "rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"}
            >
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
      {state === "pending" && !needsKyc && pathname !== "/seller/pending" && pathname !== "/seller/resubmit" && (
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
