"use client";

/**
 * Promotions (docs/contracts/commerce.md §3): campaigns with their approval life-cycle, store coupons and flash-sale
 * nominations. Everything is read straight from the server and kept live from its pushes.
 */
import { useCallback, useEffect } from "react";
import { pickText } from "@/lib/i18n-fields";
import { sellerRequest, useLiveQuery, useSocketEvent, type LiveQuery } from "@/lib/seller-api";

// ─── Campaigns ───────────────────────────────────────────────────────────────
export type CampaignState = "draft" | "pending" | "scheduled" | "active" | "ended" | "rejected";
export type EndedReason = "dates" | "budget" | "withdrawn" | "admin";

export interface SellerCampaign {
  id: string;
  reference: string;
  name: string;
  nameFr?: string | null;
  discount: number;
  productCount: number;
  productIds?: string[] | null;
  budgetUsd: number;
  spentUsd: number;
  budgetRemainingUsd: number | null;
  startDate: string | null;
  endDate: string | null;
  status: CampaignState;
  rejectReason?: string | null;
  endedReason?: EndedReason | null;
  views: number;
  clicks: number;
  orders: number;
  revenueUsd: number;
  translationStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export const campaignTitle = (c: Pick<SellerCampaign, "name" | "nameFr">, fr: boolean) => pickText(fr, c.name, c.nameFr);

const ENDED: Record<EndedReason, { en: string; fr: string }> = {
  dates: { en: "It reached its end date.", fr: "Elle a atteint sa date de fin." },
  budget: { en: "Its budget was fully used.", fr: "Son budget a été entièrement utilisé." },
  withdrawn: { en: "You withdrew it.", fr: "Vous l'avez retirée." },
  admin: { en: "Marketing ended it.", fr: "Le marketing l'a arrêtée." },
};
export const endedReasonText = (r: string | null | undefined, fr: boolean): string => (r && ENDED[r as EndedReason] ? (fr ? ENDED[r as EndedReason].fr : ENDED[r as EndedReason].en) : "");

/** Click-through rate in percent (null when nothing was viewed yet). */
export const ctr = (c: Pick<SellerCampaign, "views" | "clicks">): number | null => (c.views > 0 ? Number(((c.clicks / c.views) * 100).toFixed(1)) : null);

/** Return on budget: revenue per dollar of budget (null without a budget). */
export const roi = (c: Pick<SellerCampaign, "budgetUsd" | "revenueUsd">): number | null => (c.budgetUsd > 0 ? Number((c.revenueUsd / c.budgetUsd).toFixed(2)) : null);

/** Counters the server does not push (shopper views / clicks, coupon uses): coming back to the tab re-reads them. */
function useReloadOnFocus(reload: () => Promise<void>) {
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [reload]);
}

function upsert<T extends { id: string }>(list: T[] | null, item: T): T[] {
  const cur = list ?? [];
  const i = cur.findIndex((x) => x.id === item.id);
  if (i === -1) return [item, ...cur];
  const next = [...cur];
  next[i] = { ...next[i], ...item };
  return next;
}

/** The store's campaigns, live (`campaign:updated` carries the whole new row, applied at once). */
export function useCampaigns(enabled = true): LiveQuery<SellerCampaign[]> & { upsertLocal: (c: SellerCampaign) => void } {
  const q = useLiveQuery<SellerCampaign[]>("campaigns:list", enabled ? {} : null, {});
  const { setData } = q;
  const upsertLocal = useCallback((c: SellerCampaign) => setData((cur) => upsert(cur, c)), [setData]);
  useSocketEvent<SellerCampaign>("campaign:updated", (c) => {
    if (c && c.id) upsertLocal(c);
  });
  useReloadOnFocus(q.reload);
  return { ...q, upsertLocal };
}

export const campaignActions = {
  submit: (id: string) => sellerRequest<SellerCampaign>("campaigns:submit", { id }),
  withdraw: (id: string) => sellerRequest<SellerCampaign>("campaigns:withdraw", { id }),
  create: (input: Record<string, unknown>) => sellerRequest<SellerCampaign>("campaigns:create", input),
  update: (id: string, patch: Record<string, unknown>) => sellerRequest<SellerCampaign>("campaigns:update", { id, patch }),
};

// ─── Coupons ─────────────────────────────────────────────────────────────────
export interface SellerCoupon {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  minOrder: number;
  maxUses: number | null;
  perUserLimit: number | null;
  expiresAt: string | null;
  isPublic: boolean;
  active: boolean;
  description: string | null;
  uses: number;
  createdAt?: string;
}

export const couponActions = {
  create: (input: Record<string, unknown>) => sellerRequest<SellerCoupon>("coupons:create", input),
  update: (id: string, patch: Record<string, unknown>) => sellerRequest<SellerCoupon>("coupons:update", { id, patch }),
  setActive: (id: string, active: boolean) => sellerRequest<SellerCoupon>("coupons:setActive", { id, active }),
  remove: (id: string) => sellerRequest<{ id: string; deleted: boolean; coupon?: SellerCoupon }>("coupons:delete", { id }),
};

/** The store's coupons, live (`coupon:updated` / `coupon:removed`). */
export function useCoupons(): LiveQuery<SellerCoupon[]> & { upsertLocal: (c: SellerCoupon) => void; removeLocal: (id: string) => void } {
  const q = useLiveQuery<SellerCoupon[]>("coupons:list", {}, {});
  const { setData } = q;
  const upsertLocal = useCallback((c: SellerCoupon) => setData((cur) => upsert(cur, c)), [setData]);
  const removeLocal = useCallback((id: string) => setData((cur) => (cur ?? []).filter((x) => x.id !== id)), [setData]);
  useSocketEvent<SellerCoupon>("coupon:updated", (c) => c?.id && upsertLocal(c));
  useSocketEvent<{ id: string } | string>("coupon:removed", (p) => removeLocal(typeof p === "string" ? p : p?.id));
  useReloadOnFocus(q.reload);
  return { ...q, upsertLocal, removeLocal };
}

// ─── Flash sales ─────────────────────────────────────────────────────────────
export type FlashStatus = "nominated" | "approved" | "declined";
export type FlashPhase = "scheduled" | "running" | "ended";

export interface SellerFlashSale {
  id: string;
  title: string;
  titleFr?: string | null;
  productId: string;
  productName: string;
  productNameFr?: string | null;
  flashPrice: number;
  basePrice: number;
  discount: number;
  startsAt: string | null;
  endsAt: string;
  active: boolean;
  status: FlashStatus;
  rejectReason?: string | null;
  phase: FlashPhase;
  startsInMs?: number | null;
  endsInMs?: number | null;
  createdAt?: string;
}

export const flashActions = {
  nominate: (input: Record<string, unknown>) => sellerRequest<SellerFlashSale>("flashsales:nominate", input),
};

/** The store's flash sales and nominations, live (`flashsale:updated` / `flashsale:removed`). */
export function useFlashSales(): LiveQuery<SellerFlashSale[]> {
  const q = useLiveQuery<SellerFlashSale[]>("flashsales:mine", {}, {});
  const { setData } = q;
  useSocketEvent<SellerFlashSale>("flashsale:updated", (s) => s?.id && setData((cur) => upsert(cur, s)));
  useSocketEvent<{ id: string }>("flashsale:removed", (p) => setData((cur) => (cur ?? []).filter((x) => x.id !== p?.id)));
  return q;
}

export const flashTitle = (s: Pick<SellerFlashSale, "title" | "titleFr">, fr: boolean) => pickText(fr, s.title, s.titleFr);
export const flashProduct = (s: Pick<SellerFlashSale, "productName" | "productNameFr">, fr: boolean) => pickText(fr, s.productName, s.productNameFr);

// ─── Plan perks (`sellers:plan`) ─────────────────────────────────────────────
export interface PlanPerks {
  plan: string;
  perks: { promotions?: boolean; flashNomination?: boolean; coupons?: boolean; bulkImport?: boolean };
  maxProducts: number | null;
}

/** What the store's plan allows. A missing perk key means allowed (older plans carry none). */
export function usePlanPerks(): { perks: PlanPerks["perks"]; plan: string | null; loaded: boolean } {
  const q = useLiveQuery<PlanPerks>("sellers:plan", {}, { pushes: ["seller:updated"] });
  return { perks: q.data?.perks ?? {}, plan: q.data?.plan ?? null, loaded: q.data !== null };
}
