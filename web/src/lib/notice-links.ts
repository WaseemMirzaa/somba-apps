import type { AppNotification } from "@/lib/realtime/types";

export type NoticePortal = "shop" | "seller" | "admin" | "warehouse" | "rider";

/**
 * The page a notification opens. The server sends `link` with every notice (the same path a push opens); this
 * fallback mirrors api/src/notifications/links.ts for notices saved before links existed.
 */
export function noticeHref(n: Pick<AppNotification, "type" | "entityId" | "link">, portal: NoticePortal): string {
  if (n.link) return n.link;
  const id = n.entityId ? encodeURIComponent(n.entityId) : "";
  const pick = (withId: string, without: string) => (id ? withId : without);
  const t = n.type;
  switch (portal) {
    case "shop":
      if (t === "order" || t === "delivery") return pick(`/shop/orders/${id}`, "/shop/orders");
      if (t === "payment") return "/shop/orders";
      if (t === "return") return pick(`/shop/returns/${id}`, "/shop/returns");
      if (t === "dispute") return pick(`/shop/disputes/${id}`, "/shop/returns");
      if (t === "support") return pick(`/shop/support/${id}`, "/shop/support");
      if (t === "replacement") return pick(`/shop/replacements/${id}`, "/shop/returns");
      if (t === "exchange") return pick(`/shop/exchanges/${id}`, "/shop/returns");
      if (t === "chat") return pick(`/shop/messages/${id}`, "/shop/messages");
      if (t === "question") return pick(`/shop/products/${id}`, "/shop/products");
      if (t === "review") return pick(`/shop/products/${id}`, "/shop/products");
      return "/shop/notifications";
    case "seller":
      if (t === "order") return pick(`/seller/orders/${id}`, "/seller/orders");
      if (t === "delivery") return "/seller/orders";
      if (t === "moderation") return pick(`/seller/products/${id}`, "/seller/products");
      if (t === "payout") return "/seller/finance/payouts";
      if (t === "campaign") return pick(`/seller/promotions/${id}`, "/seller/promotions");
      if (t === "support") return pick(`/seller/support/${id}`, "/seller/support");
      if (t === "return") return pick(`/seller/returns/${id}`, "/seller/returns");
      if (t === "dispute") return pick(`/seller/disputes/${id}`, "/seller/disputes");
      if (t === "replacement") return pick(`/seller/replacements/${id}`, "/seller/replacements");
      if (t === "exchange") return pick(`/seller/exchanges/${id}`, "/seller/exchanges");
      if (t === "question") return pick(`/seller/questions?focus=${id}`, "/seller/questions");
      if (t === "review") return pick(`/seller/reviews?focus=${id}`, "/seller/reviews");
      if (t === "chat") return pick(`/seller/messages/${id}`, "/seller/messages");
      if (t === "stock") return "/seller/inventory";
      if (t === "flash") return "/seller/flash-sales";
      if (t === "promo") return "/seller/coupons";
      if (t === "finance") return "/seller/finance/tax";
      if (t === "team") return "/seller/team";
      if (t === "security") return "/seller/settings";
      return "/seller/notifications";
    case "admin":
      if (t === "order" || t === "delivery") return pick(`/admin/orders/${id}`, "/admin/orders");
      if (t === "payment") return "/admin/finance";
      if (t === "payout") return "/admin/payouts";
      if (t === "moderation") return pick(`/admin/products/${id}`, "/admin/moderation");
      if (t === "seller") return pick(`/admin/sellers/${id}`, "/admin/sellers");
      if (t === "support") return pick(`/admin/support/${id}`, "/admin/support");
      if (t === "return") return pick(`/admin/returns/${id}`, "/admin/returns");
      if (t === "dispute") return pick(`/admin/disputes/${id}`, "/admin/disputes");
      if (t === "campaign") return "/admin/marketing";
      if (t === "exchange") return pick(`/admin/fulfillment/exchanges/${id}`, "/admin/fulfillment/exchanges");
      if (t === "replacement") return pick(`/admin/fulfillment/replacements/${id}`, "/admin/fulfillment/replacements");
      return "/admin/notifications";
    case "warehouse":
      if (t === "return" || t === "dispute") return pick(`/warehouse/returns/${id}`, "/warehouse/returns");
      if (t === "exchange") return pick(`/warehouse/exchanges/${id}`, "/warehouse/exchanges");
      if (t === "replacement") return pick(`/warehouse/replacements/${id}`, "/warehouse/replacements");
      if (t === "task") return pick(`/warehouse/tasks/${id}`, "/warehouse/desk");
      if (t === "order" || t === "delivery") return "/warehouse/desk?kind=delivery";
      if (t === "support") return pick(`/warehouse/support/${id}`, "/warehouse/support");
      return "/warehouse/notifications";
    case "rider":
      if (t === "task") return pick(`/rider/tasks/${id}`, "/rider/tasks");
      if (t === "support") return pick(`/rider/support/${id}`, "/rider/support");
      return "/rider/notifications";
  }
}

/*
 * Notices sent to a whole role (every support agent, every warehouse employee) are one shared row on the server,
 * so "read" can't be stored there. Each viewer's browser remembers which of those it has seen.
 */
const SEEN_KEY = (userId: string) => `somba.seenNotices.${userId}`;

interface Seen {
  ids: string[];
  before: string | null;
}

function readSeen(userId: string): Seen {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY(userId)) ?? "null") as Seen | null;
    return { ids: Array.isArray(v?.ids) ? v.ids : [], before: typeof v?.before === "string" ? v.before : null };
  } catch {
    return { ids: [], before: null };
  }
}

function writeSeen(userId: string, seen: Seen) {
  try {
    localStorage.setItem(SEEN_KEY(userId), JSON.stringify({ ids: seen.ids.slice(-300), before: seen.before }));
  } catch {
    /* storage blocked: role notices simply show as unread again after a reload */
  }
}

/** Role notices this viewer has already seen come back as read. */
export function withSeen(userId: string | undefined, list: AppNotification[]): AppNotification[] {
  if (!userId) return list;
  const seen = readSeen(userId);
  if (!seen.ids.length && !seen.before) return list;
  const ids = new Set(seen.ids);
  return list.map((n) =>
    n.read || n.userId ? n : ids.has(n.id) || (seen.before && n.createdAt <= seen.before) ? { ...n, read: true } : n,
  );
}

export function rememberSeen(userId: string | undefined, id: string) {
  if (!userId) return;
  const seen = readSeen(userId);
  if (!seen.ids.includes(id)) writeSeen(userId, { ...seen, ids: [...seen.ids, id] });
}

export function rememberAllSeen(userId: string | undefined) {
  if (!userId) return;
  writeSeen(userId, { ids: [], before: new Date().toISOString() });
}
