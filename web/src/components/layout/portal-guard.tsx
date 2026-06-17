"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { PageLoader } from "@/components/ui/loader";
import { canAccessPath, getHomeForRole } from "@/lib/portal-access";
import type { UserRole } from "@/lib/portal-access";
import { canAdminAccess, getAdminHome } from "@/lib/admin-access";
import type { AdminDepartment } from "@/lib/admin-access";

export function PortalGuard({ children }: { children: React.ReactNode }) {
  const { persona, isAuthenticated, authReady } = useAuth();
  const { locale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const role = persona.role as UserRole;
  const department = (persona.department ?? "super") as AdminDepartment;

  // Within /admin, a manager may only reach their own department's pages.
  const adminBlocked =
    role === "admin" && pathname.startsWith("/admin") && !canAdminAccess(department, pathname);

  useEffect(() => {
    if (!authReady) return;

    if (!isAuthenticated && role === "guest") {
      const protectedPrefixes = ["/admin", "/seller", "/warehouse", "/rider"];
      if (protectedPrefixes.some((p) => pathname.startsWith(p))) {
        router.replace("/login");
      }
      return;
    }

    if (isAuthenticated && !canAccessPath(role, pathname)) {
      router.replace(getHomeForRole(role));
      return;
    }

    if (isAuthenticated && adminBlocked) {
      router.replace(getAdminHome(department));
    }
  }, [role, department, adminBlocked, pathname, router, isAuthenticated, authReady]);

  if (!authReady) {
    return <PageLoader locale={locale} />;
  }

  if (isAuthenticated && (!canAccessPath(role, pathname) || adminBlocked)) {
    return (
      <PageLoader
        locale={locale}
        label="Redirecting to your portal…"
        labelFr="Redirection vers votre portail…"
      />
    );
  }

  return <>{children}</>;
}
