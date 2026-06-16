"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, LayoutDashboard } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { BrandMark } from "@/components/landing/brand-mark";
import { getDashboardHref } from "@/lib/portal-access";
import type { UserRole } from "@/lib/portal-access";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/get-app", label: "Shop", labelFr: "Boutique" },
  { href: "/sell-online", label: "Sell Online", labelFr: "Vendre en ligne" },
  { href: "#modules", label: "Services", labelFr: "Services" },
  { href: "#portals", label: "About", labelFr: "À propos" },
];

export function MarketingHeader({ overlay = false }: { overlay?: boolean }) {
  const { locale, setLocale } = useLocale();
  const { persona, isAuthenticated, authReady } = useAuth();
  const [open, setOpen] = useState(false);
  const fr = locale === "fr";

  const dashboardHref = isAuthenticated
    ? getDashboardHref(persona.role as UserRole, persona.portal)
    : "/login";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b",
        overlay
          ? "border-white/10 bg-[#0a1233]/35 backdrop-blur-xl"
          : "glass border-[var(--border)]"
      )}
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-[72px] items-center gap-6">
          <Link href="/" className="shrink-0 transition-opacity hover:opacity-90">
            <BrandMark tone={overlay ? "light" : "dark"} wordClassName="hidden sm:block" />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  overlay
                    ? "text-white/85 hover:bg-white/10 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {fr ? item.labelFr : item.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {authReady && isAuthenticated && (
              <Link
                href={dashboardHref}
                className="hidden items-center gap-2 rounded-xl bg-[var(--primary-light)] px-4 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-tint)] sm:inline-flex"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="max-w-[120px] truncate">{persona.name}</span>
              </Link>
            )}
            <div
              className={cn(
                "hidden items-center gap-1 rounded-xl border p-1 sm:flex",
                overlay ? "border-white/20 bg-white/10" : "border-[var(--border)] bg-slate-50"
              )}
            >
              <button
                onClick={() => setLocale("en")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold",
                  locale === "en" && (overlay ? "bg-white/20 text-white shadow-sm" : "bg-white shadow-sm"),
                  overlay && locale !== "en" && "text-white/70"
                )}
              >
                EN
              </button>
              <button
                onClick={() => setLocale("fr")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold",
                  locale === "fr" && (overlay ? "bg-white/20 text-white shadow-sm" : "bg-white shadow-sm"),
                  overlay && locale !== "fr" && "text-white/70"
                )}
              >
                FR
              </button>
            </div>
            {authReady && (
              isAuthenticated ? (
                <Link
                  href={dashboardHref}
                  className={cn(
                    "hidden rounded-xl px-4 py-2 text-sm font-semibold transition-colors sm:inline-flex",
                    overlay ? "text-white/90 hover:bg-white/10" : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {fr ? "Mon tableau de bord" : "My Dashboard"}
                </Link>
              ) : (
                <Link
                  href="/login"
                  className={cn(
                    "hidden rounded-xl px-4 py-2 text-sm font-semibold transition-colors sm:inline-flex",
                    overlay ? "text-white/90 hover:bg-white/10" : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {fr ? "Connexion" : "Login"}
                </Link>
              )
            )}
            <Link href="/get-app" className="btn-primary hidden px-5 py-2.5 text-sm sm:inline-flex">
              {fr ? "Acheter" : "Shop Now"}
            </Link>
            <button
              onClick={() => setOpen(!open)}
              className={cn("rounded-lg p-2 lg:hidden", overlay ? "text-white" : "text-slate-600")}
              aria-label={fr ? "Menu" : "Menu"}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-[var(--border)] py-4 lg:hidden">
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700"
                >
                  {fr ? item.labelFr : item.label}
                </a>
              ))}
              {authReady && isAuthenticated ? (
                <Link href={dashboardHref} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--primary)]">
                  {fr ? "Mon tableau de bord" : "My Dashboard"} — {persona.name}
                </Link>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700">
                  {fr ? "Connexion équipe" : "Staff login"}
                </Link>
              )}
              <Link href="/get-app" onClick={() => setOpen(false)} className="btn-primary mt-2 px-5 py-2.5 text-sm text-center">
                {fr ? "Acheter maintenant" : "Shop now"}
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
