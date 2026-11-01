"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PortalGuard } from "@/components/layout/portal-guard";
import { SellerStoreGate } from "@/components/seller/store-gate";
import { SellerGoalsProvider } from "@/context/seller-goals-context";
import { useLocale } from "@/context/locale-context";
import { SellerDataProvider, useSellerAccess } from "@/lib/seller";
import { permissionForPath, useSellerNav } from "@/lib/seller-nav";
import { TEAM_ROLE_LABEL } from "@/lib/seller-access";

/** The sidebar for this account's role, and a polite stop when a team member opens a page their role does not cover. */
function SellerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const nav = useSellerNav();
  const access = useSellerAccess();
  const allowed = !access.loaded || access.can(permissionForPath(pathname));
  const role = TEAM_ROLE_LABEL[access.role];

  return (
    <DashboardLayout portal="seller" navItems={nav}>
      {allowed ? (
        children
      ) : (
        <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Lock className="h-6 w-6 text-slate-500" />
          </span>
          <h1 className="text-lg font-bold text-slate-900">{fr ? "Page réservée" : "Page not available"}</h1>
          <p className="text-sm text-slate-600">
            {fr
              ? `Votre rôle d'équipe (${role.fr}) n'ouvre pas cette page. Demandez au propriétaire de la boutique.`
              : `Your team role (${role.en}) does not open this page. Ask the store owner.`}
          </p>
          <Link href="/seller" className="inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
            {fr ? "Retour au tableau de bord" : "Back to the dashboard"}
          </Link>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Registration must be reachable before a store (or even a seller account)
  // exists, so it sits outside the portal guard and the store gate. The same goes for the team invitation page:
  // an invitee may not have an account yet.
  if (pathname === "/seller/register" || pathname.startsWith("/seller/team/accept")) return <>{children}</>;

  return (
    <PortalGuard>
      <SellerDataProvider>
        <SellerStoreGate>
          <SellerGoalsProvider>
            <SellerShell>{children}</SellerShell>
          </SellerGoalsProvider>
        </SellerStoreGate>
      </SellerDataProvider>
    </PortalGuard>
  );
}
