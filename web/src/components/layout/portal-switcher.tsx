"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { getVisiblePortals } from "@/lib/portal-access";
import type { UserRole } from "@/lib/portal-access";

export function PortalSwitcher({ compact }: { compact?: boolean }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const { persona } = useAuth();
  const portals = getVisiblePortals(persona.role as UserRole);

  if (portals.length <= 1) return null;

  return (
    <div className={cn(
      "flex items-center gap-1 rounded-xl bg-slate-100/80 p-1",
      compact && "text-xs"
    )}>
      {portals.map((portal) => {
        const active = pathname === portal.href || pathname.startsWith(`${portal.href}/`);
        const label = portal.i18nKey
          ? t(portal.i18nKey as Parameters<typeof t>[0])
          : portal.label;
        return (
          <Link
            key={portal.href}
            href={portal.href}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-all duration-150",
              active
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
