"use client";

/**
 * Shapes and small helpers for the seller's engagement pages: reviews, product Q&A, customer chat.
 * Contracts: docs/contracts/after-sale.md §4-§5 and docs/contracts/seller-platform.md §3.
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery, useSocketEvent, type LiveQuery } from "@/lib/seller-api";
import { pickText } from "@/lib/i18n-fields";

// ─── Reviews ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface EngageReview {
  id: string;
  productId: string;
  productName?: string;
  productNameFr?: string;
  author: string;
  rating: number;
  text: string;
  sourceLang?: string | null;
  status?: "visible" | "hidden";
  sellerReply?: string | null;
  sellerReplyAt?: string | null;
  reportCount?: number;
  moderationReason?: string | null;
  createdAt: string;
}

/** The store's visible reviews (`reviews:seller`), live on new / changed reviews. */
export function useSellerReviews(limit: number): LiveQuery<EngageReview[]> & { fresh: Set<string> } {
  const q = useLiveQuery<EngageReview[]>("reviews:seller", { limit }, { pushes: ["review:created", "review:updated"], debounceMs: 250 });
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // A review that arrives while the page is open is highlighted until the seller leaves.
  useSocketEvent<EngageReview>("review:created", (r) => {
    if (r?.id) setFresh((cur) => new Set(cur).add(r.id));
  });
  return { ...q, fresh };
}

// ─── Questions ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface EngageQuestion {
  id: string;
  productId: string;
  productName: string;
  productNameFr: string;
  productImage: string | null;
  askedBy: string;
  question: string;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  createdAt: string;
}

// ─── Chat ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ChatConversation {
  id: string;
  side: "buyer" | "seller";
  buyerId: string;
  buyerName: string;
  sellerId: string;
  storeName: string;
  storeLogo: string | null;
  productId: string | null;
  productName: string | null;
  productImage: string | null;
  orderId: string | null;
  orderReference: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: number;
}

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

export const CHAT_MAX_CHARS = 2000;
export const CHAT_MAX_PHOTOS = 4;

/** `?focus=<id>`: the record a notice pointed at. Scrolls it into view once it is rendered. */
export function useFocusId(): string | null {
  const params = useSearchParams();
  return params.get("focus");
}

/** Scroll the element with `data-focus-id=<id>` into view once, as soon as it exists. */
export function useScrollToFocus(id: string | null, ready: boolean) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !ready || done.current === id) return;
    const el = document.querySelector(`[data-focus-id="${CSS.escape(id)}"]`);
    if (el) {
      done.current = id;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}

/** The product's name in the viewer's language. */
export const productLabel = (fr: boolean, p: { productName?: string | null; productNameFr?: string | null }) =>
  pickText(fr, p.productName, p.productNameFr) || "—";

/** Short "5 min ago" / date text. */
export function agoText(iso: string, fr: boolean): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return fr ? "à l'instant" : "just now";
  if (m < 60) return fr ? `il y a ${m} min` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return fr ? `il y a ${h} h` : `${h} h ago`;
  return new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-GB");
}

// ─── Support ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Who wrote a support message, in the viewer's language (the message carries the sender's real role). */
export function senderRoleLabel(role: string | null | undefined, fr: boolean): string {
  const r = role ?? "";
  if (r === "seller") return fr ? "Vous" : "You";
  if (r === "customer") return fr ? "Client" : "Customer";
  if (r === "rider") return fr ? "Livreur" : "Rider";
  if (r === "warehouse_staff") return fr ? "Entrepôt" : "Warehouse";
  if (r === "admin_support" || r === "admin") return fr ? "Support Somba" : "Somba support";
  if (r.startsWith("admin")) return fr ? "Équipe Somba" : "Somba team";
  return r ? r.replace(/_/g, " ") : fr ? "Support Somba" : "Somba support";
}

/** A seller order as `orders:sellerList` returns it (only what the support pages need). */
export interface OrderRef {
  id: string;
  reference: string;
  createdAt: string;
  status: string;
  totalUsd?: number;
}
