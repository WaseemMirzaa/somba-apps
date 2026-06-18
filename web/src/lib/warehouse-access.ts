/**
 * Warehouse portal role model — the floor app is staffed by three roles with
 * escalating access. An Operator only sees execution tasks; a Supervisor adds
 * oversight (riders, deliveries, returns, exceptions); a Manager (and the
 * per-warehouse hub manager) has full control including analytics and hub
 * settings. Each staff member only sees and can only reach their tier's pages.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  ArrowUpDown,
  Send,
  Bike,
  MapPin,
  RotateCcw,
  RefreshCw,
  ArrowLeftRight,
  AlertTriangle,
  BarChart3,
  Settings,
  Boxes,
} from "lucide-react";
import type { WarehouseStaffRole } from "@/lib/admin-entities";

/** Escalating access levels — a role can reach every tier at or below its own. */
const ROLE_LEVEL: Record<WarehouseStaffRole, number> = {
  operator: 1,
  supervisor: 2,
  manager: 3,
};

export type WarehouseNavItem = {
  href: string;
  /** i18n key (rendered via t()). */
  label: string;
  icon: LucideIcon;
  /** Minimum role tier required to see / reach this page. */
  tier: number;
  /** Whether to show this item in the sidebar (false = access-only route). */
  nav: boolean;
};

const T = { operator: 1, supervisor: 2, manager: 3 } as const;

/**
 * All warehouse routes with their required tier. Ordered for the sidebar;
 * items with nav: false are reachable (per tier) but not shown as menu links.
 */
const WAREHOUSE_ROUTES: WarehouseNavItem[] = [
  { href: "/warehouse", label: "dashboard", icon: LayoutDashboard, tier: T.operator, nav: true },
  { href: "/warehouse/inbound", label: "inbound", icon: Inbox, tier: T.operator, nav: true },
  { href: "/warehouse/receiving", label: "receiving", icon: ClipboardCheck, tier: T.operator, nav: true },
  { href: "/warehouse/sorting", label: "sorting", icon: ArrowUpDown, tier: T.operator, nav: true },
  { href: "/warehouse/batch-builder", label: "batchBuilder", icon: Send, tier: T.operator, nav: true },
  { href: "/warehouse/dispatch", label: "dispatch", icon: Send, tier: T.operator, nav: true },
  { href: "/warehouse/inventory", label: "inventory", icon: Boxes, tier: T.operator, nav: false },
  { href: "/warehouse/parcels", label: "parcels", icon: Boxes, tier: T.operator, nav: false },
  { href: "/warehouse/riders", label: "riders", icon: Bike, tier: T.supervisor, nav: true },
  { href: "/warehouse/deliveries", label: "deliveries", icon: MapPin, tier: T.supervisor, nav: true },
  { href: "/warehouse/returns", label: "returns", icon: RotateCcw, tier: T.supervisor, nav: true },
  { href: "/warehouse/replacements", label: "replacements", icon: RefreshCw, tier: T.supervisor, nav: true },
  { href: "/warehouse/exchanges", label: "exchanges", icon: ArrowLeftRight, tier: T.supervisor, nav: true },
  { href: "/warehouse/aged", label: "agedParcels", icon: AlertTriangle, tier: T.supervisor, nav: true },
  { href: "/warehouse/exceptions", label: "exceptions", icon: AlertTriangle, tier: T.supervisor, nav: true },
  { href: "/warehouse/analytics", label: "analytics", icon: BarChart3, tier: T.manager, nav: true },
  { href: "/warehouse/hubs", label: "hubs", icon: Boxes, tier: T.manager, nav: false },
  { href: "/warehouse/settings", label: "settings", icon: Settings, tier: T.manager, nav: true },
];

export type WarehouseNavLink = { href: string; label: string; icon: LucideIcon; i18n: true };

/** Sidebar items visible to a warehouse role (tier at or below the role). */
export function getWarehouseNav(role: WarehouseStaffRole): WarehouseNavLink[] {
  const level = ROLE_LEVEL[role] ?? ROLE_LEVEL.manager;
  return WAREHOUSE_ROUTES.filter((r) => r.nav && r.tier <= level).map((r) => ({
    href: r.href,
    label: r.label,
    icon: r.icon,
    i18n: true,
  }));
}

/** Authoritative access check for a warehouse path, by role tier. */
export function canWarehouseAccess(role: WarehouseStaffRole, pathname: string): boolean {
  if (!pathname.startsWith("/warehouse")) return true;
  const level = ROLE_LEVEL[role] ?? ROLE_LEVEL.manager;

  // Longest-prefix match wins (most specific route owns the tier).
  let matched: WarehouseNavItem | null = null;
  for (const r of WAREHOUSE_ROUTES) {
    if (pathname === r.href || pathname.startsWith(r.href + "/")) {
      if (!matched || r.href.length > matched.href.length) matched = r;
    }
  }

  // Unknown routes default to operator-accessible to avoid accidental lockout.
  const requiredTier = matched ? matched.tier : T.operator;
  return level >= requiredTier;
}

/** Landing route for a role — the dashboard is open to every tier. */
export function getWarehouseHome(): string {
  return "/warehouse";
}

const ROLE_LABELS: Record<WarehouseStaffRole, { en: string; fr: string }> = {
  operator: { en: "Operator", fr: "Opérateur" },
  supervisor: { en: "Supervisor", fr: "Superviseur" },
  manager: { en: "Manager", fr: "Responsable" },
};

export function getWarehouseRoleLabel(role: WarehouseStaffRole, fr: boolean): string {
  const l = ROLE_LABELS[role] ?? ROLE_LABELS.manager;
  return fr ? l.fr : l.en;
}
