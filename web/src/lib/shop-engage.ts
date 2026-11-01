"use client";

/**
 * Live engagement helpers for the shop: flash sales with countdowns, campaign tracking, store coupons,
 * hub names, chat unread count and the customer's after-sale requests.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSocketEvent } from "@/lib/shop-live";

// ───────────────────────── campaign tracking ─────────────────────────

const tracked = new Set<string>();

/**
 * Count a campaign `view` (card/page shown) or `click` (promoted product opened). One view per campaign per
 * browser session; a click is sent every time but the server rate-limits repeats. Never throws.
 */
export function trackCampaign(campaignId: string | null | undefined, kind: "view" | "click"): void {
  if (!campaignId) return;
  const key = `${kind}:${campaignId}`;
  if (kind === "view") {
    if (tracked.has(key)) return;
    tracked.add(key);
    try {
      if (window.sessionStorage.getItem(`somba.campaign.${key}`)) return;
      window.sessionStorage.setItem(`somba.campaign.${key}`, "1");
    } catch {
      /* storage blocked: the in-memory set still dedupes this tab */
    }
  }
  if (!socketClient.current) {
    tracked.delete(key);
    return;
  }
  socketClient.request("campaigns:track", { campaignId, kind }).catch(() => {
    /* tracking is best effort */
  });
}

/** Fire a `view` once when the promoted product is on screen (mount). */
export function useCampaignView(campaignId: string | null | undefined) {
  const rt = useRealtime();
  useEffect(() => {
    if (campaignId && rt.status === "connected") trackCampaign(campaignId, "view");
  }, [campaignId, rt.status]);
}

// ───────────────────────── flash sales ─────────────────────────

export interface FlashSale {
  id: string;
  title: string | null;
  titleFr: string | null;
  productId: string;
  productName: string;
  productNameFr: string | null;
  flashPrice: number;
  basePrice: number;
  discount: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  status: "nominated" | "approved" | "declined";
  phase: "scheduled" | "running" | "ended";
  startsInMs?: number | null;
  endsInMs?: number | null;
  sellerId?: string | null;
  sellerName?: string | null;
}

/** Remaining time pieces for a countdown. */
export function splitDuration(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

export function formatCountdown(ms: number, fr: boolean): string {
  const { d, h, m, s } = splitDuration(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}${fr ? " j" : "d"} ${clock}` : clock;
}

/**
 * Real flash sales: the ones running now, plus the ones scheduled when `upcoming`. The server sends `endsInMs` /
 * `startsInMs` (its clock); `useNow` ticks locally between pushes. Live via `flashsale:updated` / `flashsale:removed`.
 */
export function useFlashSales(opts: { upcoming?: boolean } = {}) {
  const rt = useRealtime();
  const [sales, setSales] = useState<FlashSale[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const upcoming = !!opts.upcoming;

  const load = useCallback(async () => {
    try {
      const list = await socketClient.request<FlashSale[]>("flashsales:list", upcoming ? { upcoming: true } : {});
      setFetchedAt(Date.now());
      setSales(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [upcoming]);

  useEffect(() => {
    if (rt.status !== "connected") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [rt.status, load]);

  useSocketEvent<FlashSale>("flashsale:updated", () => void load());
  useSocketEvent<{ id: string }>("flashsale:removed", (p) => setSales((cur) => cur.filter((s) => s.id !== p.id)));

  return { sales, loaded, error, reload: load, fetchedAt };
}

/** A clock that ticks every second (client side) so countdowns move between server pushes. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** The remaining ms of a sale right now: server value at fetch time, minus the time elapsed since. */
export function remainingMs(sale: FlashSale, fetchedAt: number, now: number): number {
  const base = sale.phase === "scheduled" ? sale.startsInMs : sale.endsInMs;
  if (typeof base === "number") return Math.max(0, base - (now - fetchedAt));
  const target = sale.phase === "scheduled" ? sale.startsAt : sale.endsAt;
  return target ? Math.max(0, new Date(target).getTime() - now) : 0;
}

// ───────────────────────── store coupons ─────────────────────────

export interface StoreCoupon {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minOrder: number | null;
  description: string | null;
  sellerId: string;
}

export function useStoreCoupons(sellerId: string | undefined) {
  const rt = useRealtime();
  const [coupons, setCoupons] = useState<StoreCoupon[]>([]);
  const load = useCallback(() => {
    if (!sellerId) return;
    socketClient
      .request<StoreCoupon[]>("coupons:store", { sellerId })
      .then((c) => setCoupons(Array.isArray(c) ? c : []))
      .catch(() => setCoupons([]));
  }, [sellerId]);
  useEffect(() => {
    if (rt.status !== "connected") return;
    load();
  }, [rt.status, load]);
  useSocketEvent("coupon:updated", () => load());
  useSocketEvent("coupon:removed", () => load());
  return coupons;
}

export function couponLabel(c: Pick<StoreCoupon, "type" | "value">): string {
  return c.type === "percent" ? `-${c.value}%` : `-$${c.value}`;
}

// ───────────────────────── chat unread ─────────────────────────

/** Unread messages from sellers (`chat:unread`, live via `chat:message` / `chat:read`). */
export function useChatUnread(): number {
  const rt = useRealtime();
  const [n, setN] = useState(0);
  const enabled = rt.status === "connected" && rt.user?.role === "customer";
  const load = useCallback(() => {
    socketClient
      .request<{ total: number; buyer: number; seller: number }>("chat:unread")
      .then((r) => setN(r.buyer ?? 0))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);
  useSocketEvent("chat:message", () => load());
  useSocketEvent("chat:read", () => load());
  return enabled ? n : 0;
}

// ───────────────────────── hub names ─────────────────────────

export interface PublicHub {
  id: string;
  name: string;
  city: string;
  country?: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
}

/** The warehouses (public view) by id, to name the legs of an order. */
export function useHubDirectory(): Map<string, PublicHub> {
  const rt = useRealtime();
  const [hubs, setHubs] = useState<PublicHub[]>([]);
  useEffect(() => {
    if (rt.status !== "connected" || !rt.user) return;
    let alive = true;
    socketClient
      .request<PublicHub[]>("hubs:list", {})
      .then((l) => alive && setHubs(Array.isArray(l) ? l : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [rt.status, rt.user]);
  return useMemo(() => new Map(hubs.map((h) => [h.id, h])), [hubs]);
}

// ───────────────────────── chat ─────────────────────────

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderSide: "buyer" | "seller";
  senderName: string;
  text: string;
  attachments: string[];
  createdAt: string;
}

export interface ChatConversationRow {
  id: string;
  side: "buyer" | "seller";
  buyerId: string;
  buyerName: string;
  sellerId: string;
  storeName: string;
  storeLogo: string | null;
  productId: string | null;
  productName: string | null;
  /** The product's French name (`localized(c, "productName", fr)` picks the viewer's language). */
  productNameFr?: string | null;
  productImage: string | null;
  orderId: string | null;
  orderReference: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: number;
}

/** The customer's conversations with stores, newest activity first, live via `chat:message` / `chat:read`. */
export function useConversations() {
  const rt = useRealtime();
  const [rows, setRows] = useState<ChatConversationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = rt.status === "connected" && rt.user?.role === "customer";
  const load = useCallback(async () => {
    try {
      const list = await socketClient.request<ChatConversationRow[]>("chat:list", { as: "buyer" });
      setRows(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [enabled, load]);
  useSocketEvent<{ conversation: ChatConversationRow }>("chat:message", (p) => {
    if (!p?.conversation) return;
    setRows((cur) => [p.conversation, ...cur.filter((c) => c.id !== p.conversation.id)]);
  });
  useSocketEvent("chat:read", () => void load());
  return { rows, loaded, error, reload: load };
}

/** One conversation's messages (oldest first), with sending and read marks. */
export function useChatThread(conversationId: string | undefined) {
  const rt = useRealtime();
  const [conversation, setConversation] = useState<ChatConversationRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markRead = useCallback(() => {
    if (!conversationId) return;
    socketClient.request("chat:markRead", { conversationId }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || rt.status !== "connected") return;
    let alive = true;
    socketClient
      .request<{ conversation: ChatConversationRow; messages: ChatMessage[]; hasMore: boolean }>("chat:messages", { conversationId, limit: 50 })
      .then((r) => {
        if (!alive) return;
        setConversation(r.conversation);
        setMessages(r.messages);
        setHasMore(!!r.hasMore);
        setError(null);
        markRead();
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [conversationId, rt.status, markRead]);

  useSocketEvent<{ conversation: ChatConversationRow; message: ChatMessage }>("chat:message", (p) => {
    if (!p?.message || p.message.conversationId !== conversationId) return;
    setMessages((cur) => (cur.some((m) => m.id === p.message.id) ? cur : [...cur, p.message]));
    setConversation(p.conversation);
    if (p.message.senderSide === "seller") markRead();
  });

  const loadOlder = useCallback(async () => {
    if (!conversationId || messages.length === 0) return;
    const r = await socketClient.request<{ messages: ChatMessage[]; hasMore: boolean }>("chat:messages", { conversationId, before: messages[0].id, limit: 50 });
    setMessages((cur) => [...r.messages.filter((m) => !cur.some((c) => c.id === m.id)), ...cur]);
    setHasMore(!!r.hasMore);
  }, [conversationId, messages]);

  const send = useCallback(
    async (text: string, attachments: string[]) => {
      if (!conversationId) return;
      const r = await socketClient.request<{ message: ChatMessage }>("chat:send", { conversationId, text, ...(attachments.length ? { attachments } : {}) });
      setMessages((cur) => (cur.some((m) => m.id === r.message.id) ? cur : [...cur, r.message]));
    },
    [conversationId],
  );

  return { conversation, messages, hasMore, loaded, error, send, loadOlder };
}
