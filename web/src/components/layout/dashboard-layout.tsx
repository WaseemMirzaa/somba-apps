"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  RotateCcw,
  DollarSign,
  Headphones,
  Megaphone,
  BarChart3,
  Settings,
  Truck,
  Inbox,
  ArrowUpDown,
  Send,
  Boxes,
  ClipboardCheck,
  Bike,
  MapPin,
  RefreshCw,
  ArrowLeftRight,
  AlertTriangle,
  Banknote,
  Star,
  Wallet,
  Globe,
  LogOut,
  Menu,
  X,
  Sparkles,
  Zap,
  Shield,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { PortalSwitcher } from "@/components/layout/portal-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { BRAND } from "@/lib/config";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  i18n?: boolean;
};

const portalConfigs = {
  admin: {
    title: "adminPanel" as const,
    accent: "from-blue-500 to-indigo-600",
    nav: [
      { href: "/admin", label: "dashboard", icon: LayoutDashboard, i18n: true },
      { href: "/admin/sellers", label: "sellers", icon: Users, i18n: true },
      { href: "/admin/warehouses", label: "Warehouses", icon: Boxes },
      { href: "/admin/fulfillment", label: "Fulfillment Ops", icon: Truck },
      { href: "/admin/moderation", label: "Moderation", icon: Shield },
      { href: "/admin/products", label: "products", icon: Package, i18n: true },
      { href: "/admin/orders", label: "orders", icon: ShoppingCart, i18n: true },
      { href: "/admin/customers", label: "customers", icon: Users, i18n: true },
      { href: "/admin/returns", label: "returns", icon: RotateCcw, i18n: true },
      { href: "/admin/disputes", label: "Disputes", icon: AlertTriangle },
      { href: "/admin/refunds", label: "Refunds", icon: DollarSign },
      { href: "/admin/payouts", label: "Payouts", icon: Wallet },
      { href: "/admin/categories", label: "Categories", icon: Package },
      { href: "/admin/finance", label: "finance", icon: DollarSign, i18n: true },
      { href: "/admin/fraud", label: "Fraud & COD", icon: AlertTriangle },
      { href: "/admin/support", label: "support", icon: Headphones, i18n: true },
      { href: "/admin/marketing", label: "marketing", icon: Megaphone, i18n: true },
      { href: "/admin/flash-sales", label: "flashSale", icon: Zap, i18n: true },
      { href: "/admin/cms", label: "CMS", icon: FileText },
      { href: "/admin/analytics", label: "analytics", icon: BarChart3, i18n: true },
      { href: "/admin/roles", label: "Roles", icon: Users },
      { href: "/admin/audit", label: "Audit Log", icon: FileText },
      { href: "/admin/settings", label: "settings", icon: Settings, i18n: true },
    ] as NavItem[],
  },
  warehouse: {
    title: "warehousePortal" as const,
    accent: "from-indigo-500 to-violet-600",
    nav: [
      { href: "/warehouse", label: "dashboard", icon: LayoutDashboard, i18n: true },
      { href: "/warehouse/hubs", label: "Hubs", icon: Boxes },
      { href: "/warehouse/inbound", label: "inbound", icon: Inbox, i18n: true },
      { href: "/warehouse/receiving", label: "receiving", icon: ClipboardCheck },
      { href: "/warehouse/sorting", label: "sorting", icon: ArrowUpDown },
      { href: "/warehouse/inventory", label: "inventory", icon: Boxes },
      { href: "/warehouse/batch-builder", label: "Batch Builder", icon: Send },
      { href: "/warehouse/dispatch", label: "dispatch", icon: Send, i18n: true },
      { href: "/warehouse/riders", label: "riders", icon: Bike },
      { href: "/warehouse/deliveries", label: "deliveries", icon: MapPin },
      { href: "/warehouse/returns", label: "returns", icon: RotateCcw },
      { href: "/warehouse/replacements", label: "replacements", icon: RefreshCw },
      { href: "/warehouse/exchanges", label: "exchanges", icon: ArrowLeftRight },
      { href: "/warehouse/cod", label: "cod", icon: Banknote },
      { href: "/warehouse/aged", label: "Aged Parcels", icon: AlertTriangle },
      { href: "/warehouse/reconciliation", label: "Reconciliation", icon: ClipboardCheck },
      { href: "/warehouse/exceptions", label: "exceptions", icon: AlertTriangle },
      { href: "/warehouse/analytics", label: "analytics", icon: BarChart3 },
      { href: "/warehouse/settings", label: "settings", icon: Settings, i18n: true },
    ] as NavItem[],
  },
  seller: {
    title: "sellerDashboard" as const,
    accent: "from-sky-500 to-blue-600",
    nav: [
      { href: "/seller", label: "dashboard", icon: LayoutDashboard },
      { href: "/seller/storefront", label: "Storefront", icon: Globe },
      { href: "/seller/products", label: "products", icon: Package },
      { href: "/seller/inventory", label: "inventory", icon: Boxes },
      { href: "/seller/orders", label: "orders", icon: ShoppingCart },
      { href: "/seller/disputes", label: "Disputes", icon: AlertTriangle },
      { href: "/seller/notifications", label: "Notifications", icon: Megaphone },
      { href: "/seller/shipping", label: "shipping", icon: Truck },
      { href: "/seller/returns", label: "returns", icon: RotateCcw },
      { href: "/seller/replacements", label: "replacements", icon: RefreshCw },
      { href: "/seller/promotions", label: "promotions", icon: Megaphone },
      { href: "/seller/reviews", label: "reviews", icon: Star },
      { href: "/seller/finance", label: "finance", icon: Wallet },
      { href: "/seller/analytics", label: "analytics", icon: BarChart3 },
      { href: "/seller/support", label: "support", icon: Headphones },
      { href: "/seller/settings", label: "settings", icon: Settings, i18n: true },
    ] as NavItem[],
  },
};

export function DashboardLayout({
  portal,
  children,
}: {
  portal: keyof typeof portalConfigs;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t, locale, setLocale } = useLocale();
  const { persona, logout } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const config = portalConfigs[portal];

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-white/5 bg-[var(--sidebar)] transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-[72px] items-center gap-3 border-b border-white/5 px-6">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg", config.accent)}>
            <Truck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-[family-name:var(--font-display)] text-sm font-bold text-white">{BRAND.name}</p>
            <p className="text-xs text-slate-400">{t(config.title)}</p>
          </div>
          <button className="text-slate-400 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-4">
          {config.nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== `/${portal}` && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-[var(--sidebar-active)] text-white shadow-sm"
                    : "text-slate-400 hover:bg-[var(--sidebar-hover)] hover:text-white"
                )}
              >
                <item.icon className={cn("h-4 w-4", active && "text-blue-400")} />
                {item.i18n ? t(item.label as Parameters<typeof t>[0]) : item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-[var(--sidebar-hover)] hover:text-white"
          >
            <Globe className="h-4 w-4" />
            {t("landingPage")}
          </Link>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-[var(--border)] bg-white/80 px-4 backdrop-blur-xl lg:px-8">
          <button className="rounded-xl border border-[var(--border)] p-2.5 lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-slate-600" />
          </button>

          <div className="hidden lg:block">
            <PortalSwitcher compact />
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-slate-50 p-1">
            <button
              onClick={() => setLocale("en")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                locale === "en" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
              )}
            >
              EN
            </button>
            <button
              onClick={() => setLocale("fr")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                locale === "fr" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
              )}
            >
              FR
            </button>
          </div>

          <ThemeToggle />

          <Link href="/login" className="hidden text-sm text-slate-600 hover:text-blue-600 sm:block">
            {persona.name}
          </Link>

          <span className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 sm:flex">
            <Sparkles className="h-3 w-3" />
            {t("prototype")}
          </span>

          <button onClick={() => { logout(); router.push("/login"); }} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t("logout")}</span>
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
