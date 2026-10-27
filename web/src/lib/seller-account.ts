"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { sellerRequest } from "@/lib/seller-api";

/** A warehouse as the public hub directory lists it (`hubs:list`). */
export interface HubInfo {
  id: string;
  name: string;
  city: string;
  country?: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** The warehouse directory (read once per mount; names are all the portal needs). */
export function useHubs(): HubInfo[] {
  const { status } = useRealtime();
  const [hubs, setHubs] = useState<HubInfo[]>([]);
  useEffect(() => {
    if (status !== "connected") return;
    let alive = true;
    sellerRequest<HubInfo[]>("hubs:list", { activeOnly: true })
      .then((h) => alive && setHubs(h ?? []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [status]);
  return hubs;
}

// ── Notification preferences (me:prefs) ────────────────────────────────────────────────────────────────────────────
export const NOTIFY_KINDS = ["order", "payout", "stock", "review", "question", "message", "product", "promo"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export const NOTIFY_LABEL: Record<NotifyKind, { en: string; fr: string; descEn: string; descFr: string }> = {
  order: { en: "Orders and deliveries", fr: "Commandes et livraisons", descEn: "New orders, pickups, returns, disputes, replacements and exchanges.", descFr: "Nouvelles commandes, collectes, retours, litiges, remplacements et échanges." },
  payout: { en: "Payouts and finance", fr: "Versements et finance", descEn: "Payout requests, payments and commission invoices.", descFr: "Demandes de versement, paiements et factures de commission." },
  stock: { en: "Stock alerts", fr: "Alertes de stock", descEn: "Low stock and out-of-stock warnings.", descFr: "Alertes de stock bas et de rupture." },
  review: { en: "Reviews", fr: "Avis", descEn: "New reviews and moderation decisions on them.", descFr: "Nouveaux avis et décisions de modération." },
  question: { en: "Product questions", fr: "Questions sur les produits", descEn: "Shoppers asking about your products.", descFr: "Questions des clients sur vos produits." },
  message: { en: "Customer messages", fr: "Messages des clients", descEn: "New chat messages from shoppers.", descFr: "Nouveaux messages des clients." },
  product: { en: "Listings and moderation", fr: "Annonces et modération", descEn: "Approvals and refusals of your listings.", descFr: "Validations et refus de vos annonces." },
  promo: { en: "Promotions and flash sales", fr: "Promotions et ventes flash", descEn: "Campaign decisions, budgets and flash sales.", descFr: "Décisions sur les campagnes, budgets et ventes flash." },
};

export interface Prefs {
  push?: boolean;
  email?: boolean;
  sms?: boolean;
  notify?: Partial<Record<NotifyKind, boolean>>;
  [k: string]: unknown;
}

// ── Two-factor authentication ──────────────────────────────────────────────────────────────────────────────────────
export interface TwoFaStatus {
  enabled: boolean;
  pending: boolean;
  recoveryRemaining: number;
  required: boolean;
}

export interface TwoFaSetup {
  secret: string;
  otpauthUrl: string;
  issuer: string;
  account: string;
}

// ── Payout account ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface PayoutAccount {
  method: "bank" | "mobile_money" | null;
  account: string | null;
  masked: string | null;
  set: boolean;
}

// ── Team ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TeamMember {
  id: string;
  userId: string | null;
  email: string;
  name: string | null;
  role: "owner" | "manager" | "catalog" | "orders" | "finance" | "support";
  status: "invited" | "active";
  isOwner?: boolean;
  invitedAt: string | null;
  acceptedAt: string | null;
  inviteExpiresAt: string | null;
}

export interface TeamData {
  seller: { id: string; name: string };
  seats: { used: number; max: number | null };
  members: TeamMember[];
}

/** The invitation link for a token (the page the invitee opens). */
export function inviteLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/seller/team/accept?token=${encodeURIComponent(token)}`;
}

/** A copy-to-clipboard helper that never throws (clipboard may be blocked). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A small "pending" flag hook: wraps an async action and reports `busy`. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

/** Download text as a file (recovery codes). */
export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
