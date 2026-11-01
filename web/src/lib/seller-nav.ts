"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Globe,
  Headphones,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  MessageSquareQuote,
  Package,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingCart,
  Star,
  Ticket,
  Truck,
  Users,
  Wallet,
  Zap,
  Bell,
} from "lucide-react";
import type { NavItem } from "@/components/layout/dashboard-layout";
import { useSellerAccess, useSellerTickets } from "@/lib/seller";
import { useLiveQuery } from "@/lib/seller-api";
import type { SellerPermission } from "@/lib/seller-access";

interface Entry extends NavItem {
  perm: SellerPermission;
}

/**
 * Every seller page, with the permission that opens it (docs/contracts/seller-platform.md §0).
 * `catalog_read` is what the server lets every role READ (product names on an order, a coupon code in a chat); the
 * catalogue PAGES (products, inventory, promotions, coupons, flash sales) belong to the `catalog` permission, so a
 * Support or Orders member does not get them in the menu or by typing the address.
 */
const ENTRIES: Entry[] = [
  { href: "/seller", label: "dashboard", icon: LayoutDashboard, i18n: true, perm: "any" },
  { href: "/seller/storefront", label: "storefront", icon: Globe, i18n: true, perm: "storefront" },
  { href: "/seller/products", label: "products", icon: Package, i18n: true, perm: "catalog" },
  { href: "/seller/inventory", label: "inventory", icon: Boxes, i18n: true, perm: "catalog" },
  { href: "/seller/orders", label: "orders", icon: ShoppingCart, i18n: true, perm: "orders" },
  { href: "/seller/messages", label: "Messages", labelFr: "Messages", icon: MessageCircle, perm: "support" },
  { href: "/seller/questions", label: "Questions", labelFr: "Questions", icon: MessageSquareQuote, perm: "support" },
  { href: "/seller/disputes", label: "disputes", icon: AlertTriangle, i18n: true, perm: "orders" },
  { href: "/seller/notifications", label: "notifications", icon: Bell, i18n: true, perm: "any" },
  { href: "/seller/shipping", label: "shipping", icon: Truck, i18n: true, perm: "orders" },
  { href: "/seller/returns", label: "returns", icon: RotateCcw, i18n: true, perm: "orders" },
  { href: "/seller/replacements", label: "replacements", icon: RefreshCw, i18n: true, perm: "orders" },
  { href: "/seller/exchanges", label: "exchanges", icon: ArrowLeftRight, i18n: true, perm: "orders" },
  { href: "/seller/promotions", label: "promotions", icon: Megaphone, i18n: true, perm: "catalog" },
  { href: "/seller/coupons", label: "Coupons", labelFr: "Coupons", icon: Ticket, perm: "catalog" },
  { href: "/seller/flash-sales", label: "Flash sales", labelFr: "Ventes flash", icon: Zap, perm: "catalog" },
  { href: "/seller/reviews", label: "reviews", icon: Star, i18n: true, perm: "support" },
  { href: "/seller/finance", label: "finance", icon: Wallet, i18n: true, perm: "finance" },
  { href: "/seller/analytics", label: "analytics", icon: BarChart3, i18n: true, perm: "insight" },
  { href: "/seller/support", label: "support", icon: Headphones, i18n: true, perm: "support" },
  { href: "/seller/team", label: "Team", labelFr: "Équipe", icon: Users, perm: "team" },
  { href: "/seller/settings", label: "settings", icon: Settings, i18n: true, perm: "any" },
];

/**
 * The seller sidebar for this account: owners see everything, a team member only what their role opens.
 * Badges (unanswered questions, unread customer messages, unread support replies) are live.
 */
export function useSellerNav(): NavItem[] {
  const access = useSellerAccess();
  const { tickets } = useSellerTickets();
  const canSupport = access.can("support");
  const questions = useLiveQuery<{ count: number }>("questions:unanswered", canSupport ? {} : null, {
    pushes: ["question:created", "question:updated", "notification:new"],
  });
  const chat = useLiveQuery<{ total: number; buyer: number; seller: number }>("chat:unread", canSupport ? {} : null, {
    pushes: ["chat:message", "chat:read"],
  });
  const ticketUnread = tickets.reduce((n, t) => n + (Number((t as { userUnread?: number }).userUnread) || 0), 0);

  const badge: Record<string, number> = {
    "/seller/questions": questions.data?.count ?? 0,
    "/seller/messages": chat.data?.seller ?? 0,
    "/seller/support": ticketUnread,
  };
  return ENTRIES.filter((e) => access.can(e.perm)).map(({ perm, ...item }) => {
    void perm;
    return badge[item.href] ? { ...item, badge: badge[item.href] } : item;
  });
}

export const SELLER_NAV_HREFS = ENTRIES.map((e) => e.href);

/** Extra pages and the permission they need (the menu has no entry for them). */
const EXTRA: [string, SellerPermission][] = [
  ["/seller/products/import", "catalog"],
  ["/seller/products/create", "catalog"],
  ["/seller/storefront/preview", "storefront"],
  ["/seller/finance/payouts/request", "finance"],
  ["/seller/promotions/create", "catalog"],
  ["/seller/subscribe", "account"],
  ["/seller/resubmit", "account"],
  ["/seller/pending", "any"],
  ["/seller/team/accept", "any"],
  ["/seller/register", "any"],
];

/** The permission a seller URL needs: the longest menu/extra path that is a prefix of it (default: no restriction). */
export function permissionForPath(pathname: string): SellerPermission {
  const all: [string, SellerPermission][] = [...EXTRA, ...ENTRIES.map((e) => [e.href, e.perm] as [string, SellerPermission])];
  let best: [string, SellerPermission] | null = null;
  for (const [href, perm] of all) {
    const hit = pathname === href || (href !== "/seller" && pathname.startsWith(`${href}/`));
    if (hit && (!best || href.length > best[0].length)) best = [href, perm];
  }
  return best ? best[1] : "any";
}
