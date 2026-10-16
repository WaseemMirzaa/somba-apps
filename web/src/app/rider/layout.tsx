"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { List, User, Wallet, Home, LogOut, Bell, MapPin } from "lucide-react";
import { useRealtime } from "@/context/realtime-context";
import { RiderGpsProvider } from "@/lib/rider-gps";
import { BrandMark } from "@/components/landing/brand-mark";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { PortalGuard } from "@/components/layout/portal-guard";

const nav = [
  { href: "/rider", icon: Home, label: "dashboard" },
  { href: "/rider/tasks", icon: List, label: "activeTasks" },
  { href: "/rider/zone", icon: MapPin, label: "myZone" },
  { href: "/rider/earnings", icon: Wallet, label: "earnings" },
  { href: "/rider/profile", icon: User, label: "myAccount" },
];

/** Notification bell with the live unread count from the server. */
function RiderBell() {
  const { unreadCount } = useRealtime();
  return (
    <Link
      href="/rider/notifications"
      className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, locale, setLocale } = useLocale();
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <PortalGuard>
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-lg items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BrandMark compact />
            <p className="text-[10px] font-medium text-emerald-600">{t("riderApp")}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-[10px]">
              <button onClick={() => setLocale("en")} className={cn("rounded px-2 py-0.5 font-semibold", locale === "en" ? "bg-emerald-600 text-white" : "text-slate-500")}>EN</button>
              <button onClick={() => setLocale("fr")} className={cn("rounded px-2 py-0.5 font-semibold", locale === "fr" ? "bg-emerald-600 text-white" : "text-slate-500")}>FR</button>
            </div>
            <RiderBell />
            <button onClick={() => { logout(); router.push("/login"); }} className="rounded-lg p-1.5 text-slate-500 hover:text-red-600" aria-label="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <RiderGpsProvider>
        <main className="mx-auto max-w-lg px-4 py-6 pb-24">{children}</main>
      </RiderGpsProvider>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg justify-around py-2">
          {nav.map((item) => {
            const active = pathname === item.href || (item.href !== "/rider" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-4 py-2 text-[10px] font-semibold transition-colors",
                  active ? "text-emerald-600" : "text-slate-400"
                )}
              >
                <item.icon className="h-5 w-5" />
                {t(item.label as Parameters<typeof t>[0])}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
    </PortalGuard>
  );
}
