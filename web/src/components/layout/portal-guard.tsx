"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { canAccessPath, getHomeForRole } from "@/lib/portal-access";
import type { UserRole } from "@/lib/portal-access";

export function PortalGuard({ children }: { children: React.ReactNode }) {
  const { persona, isAuthenticated, authReady } = useAuth();
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const role = persona.role as UserRole;

  useEffect(() => {
    if (!authReady) return;

    if (!isAuthenticated && role === "guest") {
      if (pathname === "/seller/register") return;
      const protectedPrefixes = ["/admin", "/seller", "/warehouse", "/rider"];
      if (protectedPrefixes.some((p) => pathname.startsWith(p))) {
        router.replace("/login");
      }
      return;
    }

    if (isAuthenticated && !canAccessPath(role, pathname)) {
      router.replace(getHomeForRole(role));
    }
  }, [role, pathname, router, isAuthenticated, authReady]);

  if (!authReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        {t("loading")}
      </div>
    );
  }

  if (isAuthenticated && !canAccessPath(role, pathname)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        {t("redirectingPortal")}
      </div>
    );
  }

  return <>{children}</>;
}
