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
  Star,
  Banknote,
  Globe,
  LogOut,
  Menu,
  X,
  Sparkles,
  Zap,
  Shield,
  FileText,
} from "lucide-react";
import { useState, useRef, useCallback, useLayoutEffect } from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { PortalSwitcher } from "@/components/layout/portal-switcher";
import { BrandMark } from "@/components/landing/brand-mark";
import { useAuth } from "@/context/auth-context";
import { getAdminSections, getDepartmentLabel } from "@/lib/admin-access";
import type { AdminDepartment } from "@/lib/admin-access";
import { getWarehouseNav, getWarehouseRoleLabel } from "@/lib/warehouse-access";
import type { WarehouseStaffRole } from "@/lib/admin-entities";
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
    accent: "from-red-500 to-red-700",
    nav: [
      { href: "/admin", label: "dashboard", icon: LayoutDashboard, i18n: true },
      { href: "/admin/sellers", label: "sellers", icon: Users, i18n: true },
      { href: "/admin/warehouses", label: "warehouses", icon: Boxes, i18n: true },
      { href: "/admin/warehouses/staff", label: "warehouseStaff", icon: Users, i18n: true },
      { href: "/admin/fulfillment", label: "fulfillmentOps", icon: Truck, i18n: true },
      { href: "/admin/moderation", label: "moderation", icon: Shield, i18n: true },
      { href: "/admin/products", label: "products", icon: Package, i18n: true },
      { href: "/admin/orders", label: "orders", icon: ShoppingCart, i18n: true },
      { href: "/admin/customers", label: "customers", icon: Users, i18n: true },
      { href: "/admin/returns", label: "returns", icon: RotateCcw, i18n: true },
      { href: "/admin/disputes", label: "disputes", icon: AlertTriangle, i18n: true },
      { href: "/admin/refunds", label: "refunds", icon: DollarSign, i18n: true },
      { href: "/admin/payouts", label: "payouts", icon: Banknote, i18n: true },
      { href: "/admin/categories", label: "categories", icon: Package, i18n: true },
      { href: "/admin/finance", label: "finance", icon: DollarSign, i18n: true },
      { href: "/admin/fraud", label: "fraudPayments", icon: AlertTriangle, i18n: true },
      { href: "/admin/support", label: "support", icon: Headphones, i18n: true },
      { href: "/admin/flash-sales", label: "flashSale", icon: Zap, i18n: true },
      { href: "/admin/cms", label: "cms", icon: FileText, i18n: true },
      { href: "/admin/roles", label: "roles", icon: Users, i18n: true },
      { href: "/admin/audit", label: "auditLog", icon: FileText, i18n: true },
      { href: "/admin/settings", label: "settings", icon: Settings, i18n: true },
    ] as NavItem[],
  },
  warehouse: {
    title: "warehousePortal" as const,
    accent: "from-red-500 to-red-700",
    nav: [
      { href: "/warehouse", label: "dashboard", icon: LayoutDashboard, i18n: true },
      { href: "/warehouse/inbound", label: "inbound", icon: Inbox, i18n: true },
      { href: "/warehouse/receiving", label: "receiving", icon: ClipboardCheck, i18n: true },
      { href: "/warehouse/sorting", label: "sorting", icon: ArrowUpDown, i18n: true },
      { href: "/warehouse/batch-builder", label: "batchBuilder", icon: Send, i18n: true },
      { href: "/warehouse/dispatch", label: "dispatch", icon: Send, i18n: true },
      { href: "/warehouse/riders", label: "riders", icon: Bike, i18n: true },
      { href: "/warehouse/deliveries", label: "deliveries", icon: MapPin, i18n: true },
      { href: "/warehouse/returns", label: "returns", icon: RotateCcw, i18n: true },
      { href: "/warehouse/replacements", label: "replacements", icon: RefreshCw, i18n: true },
      { href: "/warehouse/exchanges", label: "exchanges", icon: ArrowLeftRight, i18n: true },
      { href: "/warehouse/aged", label: "agedParcels", icon: AlertTriangle, i18n: true },
      { href: "/warehouse/exceptions", label: "exceptions", icon: AlertTriangle, i18n: true },
      { href: "/warehouse/analytics", label: "analytics", icon: BarChart3, i18n: true },
      { href: "/warehouse/settings", label: "settings", icon: Settings, i18n: true },
    ] as NavItem[],
  },
  seller: {
    title: "sellerDashboard" as const,
    accent: "from-red-500 to-red-700",
    nav: [
      { href: "/seller", label: "dashboard", icon: LayoutDashboard, i18n: true },
      { href: "/seller/storefront", label: "storefront", icon: Globe, i18n: true },
      { href: "/seller/products", label: "products", icon: Package, i18n: true },
      { href: "/seller/inventory", label: "inventory", icon: Boxes, i18n: true },
      { href: "/seller/orders", label: "orders", icon: ShoppingCart, i18n: true },
      { href: "/seller/disputes", label: "disputes", icon: AlertTriangle, i18n: true },
      { href: "/seller/notifications", label: "notifications", icon: Megaphone, i18n: true },
      { href: "/seller/shipping", label: "shipping", icon: Truck, i18n: true },
      { href: "/seller/returns", label: "returns", icon: RotateCcw, i18n: true },
      { href: "/seller/replacements", label: "replacements", icon: RefreshCw, i18n: true },
      { href: "/seller/promotions", label: "promotions", icon: Megaphone, i18n: true },
      { href: "/seller/reviews", label: "reviews", icon: Star, i18n: true },
      { href: "/seller/finance", label: "finance", icon: Banknote, i18n: true },
      { href: "/seller/analytics", label: "analytics", icon: BarChart3, i18n: true },
      { href: "/seller/support", label: "support", icon: Headphones, i18n: true },
      { href: "/seller/settings", label: "settings", icon: Settings, i18n: true },
    ] as NavItem[],
  },
};

const sidebarScrollPositions = new Map<string, number>();

function usePersistedSidebarScroll(portal: string) {
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  const saveScroll = useCallback(() => {
    const nav = navRef.current;
    if (nav) sidebarScrollPositions.set(portal, nav.scrollTop);
  }, [portal]);

  const restoreScroll = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = sidebarScrollPositions.get(portal);
    if (saved !== undefined) nav.scrollTop = saved;
  }, [portal]);

  useLayoutEffect(() => {
    restoreScroll();
  }, [pathname, restoreScroll]);

  useLayoutEffect(() => {
    restoreScroll();
  }, [portal, restoreScroll]);

  return { navRef, saveScroll };
}

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
  const { navRef, saveScroll } = usePersistedSidebarScroll(portal);

  const department = (persona.department ?? "super") as AdminDepartment;
  const adminSections = portal === "admin" ? getAdminSections(department) : null;

  const warehouseRole = (persona.warehouseRole ?? "manager") as WarehouseStaffRole;
  const warehouseNav = portal === "warehouse" ? getWarehouseNav(warehouseRole) : null;

  // Only one nav item may appear selected at a time. Several hrefs can match
  // the current path at once — e.g. "/admin/warehouses" is a prefix of
  // "/admin/warehouses/staff", and the portal root is a prefix of every
  // sub-route — so resolve the single best match: the longest href the path
  // equals or sits beneath (on a path boundary). The portal root only counts
  // on an exact match, so it never lights up alongside a sub-page.
  const navItems = adminSections
    ? adminSections.flatMap((section) => section.items)
    : (warehouseNav ?? config.nav);
  const portalRoot = `/${portal}`;
  let activeHref: string | null = null;
  for (const item of navItems) {
    const matches =
      pathname === item.href ||
      (item.href !== portalRoot && pathname.startsWith(`${item.href}/`));
    if (matches && (activeHref === null || item.href.length > activeHref.length)) {
      activeHref = item.href;
    }
  }

  const renderNavItem = (item: NavItem) => {
    const active = item.href === activeHref;
    return (
      <Link
        key={item.href}
        href={item.href}
        scroll={false}
        onClick={() => {
          saveScroll();
          setSidebarOpen(false);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
          active
            ? "bg-[var(--sidebar-active)] text-white shadow-sm"
            : "text-slate-400 hover:bg-[var(--sidebar-hover)] hover:text-white"
        )}
      >
        <item.icon className={cn("h-4 w-4", active && "text-red-400")} />
        {item.i18n ? t(item.label as Parameters<typeof t>[0]) : item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[272px] flex-col border-r border-white/5 bg-[var(--sidebar)] transition-transform",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/5 px-6">
          <BrandMark tone="light" compact />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">
              {portal === "admin"
                ? getDepartmentLabel(department, locale === "fr")
                : portal === "warehouse"
                  ? `${t(config.title)} · ${getWarehouseRoleLabel(warehouseRole, locale === "fr")}`
                  : t(config.title)}
            </p>
          </div>
          <button className="text-slate-400 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav
          ref={navRef}
          onScroll={saveScroll}
          className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-4 [overflow-anchor:none]"
        >
          {adminSections
            ? adminSections.map((section) => (
                <div key={section.id} className="mb-1.5">
                  {adminSections.length > 1 && (
                    <p className="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {locale === "fr" ? section.titleFr : section.titleEn}
                    </p>
                  )}
                  {section.items.map(renderNavItem)}
                </div>
              ))
            : (warehouseNav ?? config.nav).map(renderNavItem)}
        </nav>

        <div className="shrink-0 border-t border-white/5 p-4">
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

      <div className="flex min-h-screen min-w-0 flex-col lg:pl-[272px]">
        <header className="relative z-30 flex h-[72px] items-center gap-4 border-b border-[var(--border)] bg-white px-4 lg:sticky lg:top-0 lg:bg-white/80 lg:px-8 lg:backdrop-blur-xl">
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
                locale === "en" ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-500"
              )}
            >
              EN
            </button>
            <button
              onClick={() => setLocale("fr")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                locale === "fr" ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-500"
              )}
            >
              FR
            </button>
          </div>

          <Link href="/login" className="hidden text-sm text-slate-600 hover:text-[var(--primary)] sm:block">
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
