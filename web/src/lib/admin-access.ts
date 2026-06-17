/**
 * Admin department model — the Admin Panel is split into departments, each
 * managed by a separate manager. A manager only sees and can only reach their
 * own department's pages. The Super Admin sees every department and is the only
 * role that can assign credentials (roles), view the marketplace dashboard, the
 * audit log and global settings.
 *
 * Hard rule: an Operations manager must never reach Finance, and vice-versa.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Boxes,
  Truck,
  Shield,
  Package,
  ShoppingCart,
  RotateCcw,
  AlertTriangle,
  DollarSign,
  Wallet,
  Settings,
  Headphones,
  Zap,
  FileText,
  BarChart3,
  Star,
  Megaphone,
  Send,
  MapPin,
} from "lucide-react";

export type AdminDepartment =
  | "super"
  | "finance"
  | "operations"
  | "warehouse"
  | "moderation"
  | "marketing"
  | "support";

export type AdminNavItem = {
  href: string;
  /** Either an i18n key (when i18n = true) or a literal label. */
  label: string;
  icon: LucideIcon;
  i18n?: boolean;
};

export type AdminNavSection = {
  id: AdminDepartment;
  titleEn: string;
  titleFr: string;
  /** First item is treated as the department's landing/dashboard. */
  items: AdminNavItem[];
};

/** Pages only the Super Admin can reach. */
const SUPER_SECTION: AdminNavSection = {
  id: "super",
  titleEn: "Administration",
  titleFr: "Administration",
  items: [
    { href: "/admin", label: "dashboard", icon: LayoutDashboard, i18n: true },
    { href: "/admin/roles", label: "roles", icon: Users, i18n: true },
    { href: "/admin/audit", label: "auditLog", icon: FileText, i18n: true },
    { href: "/admin/settings", label: "settings", icon: Settings, i18n: true },
  ],
};

/** Department sections, in display order. */
const DEPARTMENT_SECTIONS: AdminNavSection[] = [
  {
    id: "finance",
    titleEn: "Finance",
    titleFr: "Finance",
    items: [
      { href: "/admin/finance", label: "finance", icon: DollarSign, i18n: true },
      { href: "/admin/payouts", label: "payouts", icon: Wallet, i18n: true },
      { href: "/admin/refunds", label: "refunds", icon: DollarSign, i18n: true },
      { href: "/admin/fraud", label: "fraudPayments", icon: AlertTriangle, i18n: true },
      { href: "/admin/analytics", label: "analytics", icon: BarChart3, i18n: true },
    ],
  },
  {
    id: "operations",
    titleEn: "Operations",
    titleFr: "Opérations",
    items: [
      { href: "/admin/orders", label: "orders", icon: ShoppingCart, i18n: true },
      { href: "/admin/fulfillment", label: "fulfillmentOps", icon: Truck, i18n: true },
      { href: "/admin/disputes", label: "disputes", icon: AlertTriangle, i18n: true },
      { href: "/admin/returns", label: "returns", icon: RotateCcw, i18n: true },
      { href: "/admin/zones", label: "zones", icon: MapPin, i18n: true },
    ],
  },
  {
    id: "warehouse",
    titleEn: "Warehouse Admin",
    titleFr: "Admin entrepôt",
    items: [
      { href: "/admin/warehouses", label: "warehouses", icon: Boxes, i18n: true },
      { href: "/admin/warehouses/staff", label: "warehouseStaff", icon: Users, i18n: true },
      { href: "/admin/fulfillment/inventory", label: "inventory", icon: Boxes, i18n: true },
      { href: "/admin/fulfillment/dispatch", label: "dispatch", icon: Send, i18n: true },
    ],
  },
  {
    id: "moderation",
    titleEn: "Moderation",
    titleFr: "Modération",
    items: [
      { href: "/admin/moderation", label: "moderation", icon: Shield, i18n: true },
      { href: "/admin/products", label: "products", icon: Package, i18n: true },
      { href: "/admin/sellers", label: "sellers", icon: Users, i18n: true },
      { href: "/admin/reviews", label: "reviews", icon: Star, i18n: true },
      { href: "/admin/categories", label: "categories", icon: Package, i18n: true },
    ],
  },
  {
    id: "marketing",
    titleEn: "Marketing",
    titleFr: "Marketing",
    items: [
      { href: "/admin/flash-sales", label: "flashSale", icon: Zap, i18n: true },
      { href: "/admin/promotions", label: "promotions", icon: Megaphone, i18n: true },
      { href: "/admin/cms", label: "cms", icon: FileText, i18n: true },
      { href: "/admin/broadcasts", label: "broadcasts", icon: Megaphone, i18n: true },
      { href: "/admin/marketing", label: "marketing", icon: Megaphone, i18n: true },
    ],
  },
  {
    id: "support",
    titleEn: "Support",
    titleFr: "Support",
    items: [
      { href: "/admin/support", label: "support", icon: Headphones, i18n: true },
      { href: "/admin/customers", label: "customers", icon: Users, i18n: true },
    ],
  },
];

const SECTION_BY_ID = new Map<AdminDepartment, AdminNavSection>(
  DEPARTMENT_SECTIONS.map((s) => [s.id, s])
);

/**
 * Sidebar sections visible to a department. The Super Admin sees the
 * Administration section plus every department, grouped by role. A department
 * manager sees only their own section.
 */
export function getAdminSections(dept: AdminDepartment): AdminNavSection[] {
  if (dept === "super") return [SUPER_SECTION, ...DEPARTMENT_SECTIONS];
  const section = SECTION_BY_ID.get(dept);
  return section ? [section] : [];
}

/** Where a department lands after login. */
export function getAdminHome(dept: AdminDepartment): string {
  if (dept === "super") return "/admin";
  return SECTION_BY_ID.get(dept)?.items[0]?.href ?? "/admin";
}

/** Path prefixes a department is allowed to reach inside /admin. */
function allowedPrefixes(dept: AdminDepartment): string[] {
  if (dept === "super") return ["/admin"];
  const section = SECTION_BY_ID.get(dept);
  return section ? section.items.map((i) => i.href) : [];
}

/**
 * Authoritative access check for an admin path. Super Admin reaches everything;
 * every other manager is confined to their department's pages.
 */
export function canAdminAccess(dept: AdminDepartment, pathname: string): boolean {
  if (!pathname.startsWith("/admin")) return true;
  if (dept === "super") return true;
  return allowedPrefixes(dept).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

const DEPARTMENT_LABELS: Record<AdminDepartment, { en: string; fr: string }> = {
  super: { en: "Super Admin", fr: "Super admin" },
  finance: { en: "Finance", fr: "Finance" },
  operations: { en: "Operations", fr: "Opérations" },
  warehouse: { en: "Warehouse Admin", fr: "Admin entrepôt" },
  moderation: { en: "Moderation", fr: "Modération" },
  marketing: { en: "Marketing", fr: "Marketing" },
  support: { en: "Support", fr: "Support" },
};

export function getDepartmentLabel(dept: AdminDepartment, fr: boolean): string {
  const l = DEPARTMENT_LABELS[dept];
  return fr ? l.fr : l.en;
}
