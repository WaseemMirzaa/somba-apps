"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { useSellerAccess, useStoreGate } from "@/lib/seller";
import { sellerRequest } from "@/lib/seller-api";
import type { SellerAnalytics } from "@/lib/seller-analytics";

/**
 * Personal targets for the last 30 days, kept on the SERVER (`sellers:goals:get` / `sellers:goals:set`), so they follow
 * the store to every browser and every team member who may read them. Only the TARGET is stored; the "current" value is
 * always the live figure from `analytics:seller` (or the listing count), never something typed by hand.
 */
export type GoalMetric = "revenue" | "orders" | "rating" | "products";

export type SellerGoal = {
  /** One goal per metric, so the metric is also its id. */
  id: string;
  metric: GoalMetric;
  target: number;
};

/** What the server stores: `null` = no goal on that metric. */
export interface ServerGoals {
  revenueUsd: number | null;
  orders: number | null;
  rating: number | null;
  products: number | null;
}

export const GOAL_METRICS: {
  value: GoalMetric;
  label: string;
  labelFr: string;
  kind: "currency" | "number" | "rating" | "percent";
  /** Largest target the server accepts. */
  max: number;
  /** Current value, from the 30-day analytics (null = no data to judge yet). `ctx.products` = live listings. */
  current: (a: SellerAnalytics, ctx: { products: number }) => number | null;
}[] = [
  { value: "revenue", label: "Revenue (30 days)", labelFr: "Revenu (30 jours)", kind: "currency", max: 1_000_000_000, current: (a) => a.revenue },
  { value: "orders", label: "Orders (30 days)", labelFr: "Commandes (30 jours)", kind: "number", max: 1_000_000_000, current: (a) => a.orders },
  { value: "rating", label: "Average rating", labelFr: "Note moyenne", kind: "rating", max: 5, current: (a) => a.reviews.average },
  { value: "products", label: "Live listings", labelFr: "Annonces en ligne", kind: "number", max: 1_000_000_000, current: (_a, ctx) => ctx.products },
];

const SERVER_KEY: Record<GoalMetric, keyof ServerGoals> = { revenue: "revenueUsd", orders: "orders", rating: "rating", products: "products" };
const VALID = new Set<string>(GOAL_METRICS.map((m) => m.value));
/** The old browser-only copy (migrated to the server once, then removed). */
const LEGACY_KEY = "somba-teka-seller-goals-v2";

const toList = (g: Partial<ServerGoals> | null | undefined): SellerGoal[] =>
  GOAL_METRICS.flatMap((m) => {
    const v = g?.[SERVER_KEY[m.value]];
    return typeof v === "number" && v > 0 ? [{ id: m.value, metric: m.value, target: v }] : [];
  });

const toServer = (list: SellerGoal[]): ServerGoals => {
  const out: ServerGoals = { revenueUsd: null, orders: null, rating: null, products: null };
  for (const g of list) if (VALID.has(g.metric) && Number(g.target) > 0) out[SERVER_KEY[g.metric]] = Number(g.target);
  return out;
};

type SellerGoalsContextType = {
  goals: SellerGoal[];
  goalsReady: boolean;
  /** The signed-in account may change the targets (owner / manager). */
  canEdit: boolean;
  /** Replace the whole set of goals. Rejects with the server's message. */
  saveGoals: (next: SellerGoal[]) => Promise<void>;
};

const SellerGoalsContext = createContext<SellerGoalsContextType | null>(null);

export function newGoalId() {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function SellerGoalsProvider({ children }: { children: React.ReactNode }) {
  const { status } = useRealtime();
  const access = useSellerAccess();
  const { seller } = useStoreGate();
  const [goals, setGoals] = useState<SellerGoal[]>([]);
  const [goalsReady, setGoalsReady] = useState(false);
  const canRead = access.can("insight");
  const canEdit = access.can("storefront") && !access.suspended;
  const migrated = useRef(false);

  const apply = useCallback((g: Partial<ServerGoals> | null | undefined) => setGoals(toList(g)), []);

  useEffect(() => {
    if (status !== "connected" || !access.loaded) return;
    if (!canRead) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a role without the dashboard has no goals to show
      setGoalsReady(true);
      return;
    }
    let alive = true;
    sellerRequest<ServerGoals>("sellers:goals:get")
      .then(async (server) => {
        if (!alive) return;
        let current = server;
        // The targets used to live in this browser only: move them to the server once.
        if (!migrated.current && canEdit && toList(server).length === 0) {
          migrated.current = true;
          try {
            const old = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
            if (Array.isArray(old)) {
              const legacy: SellerGoal[] = old
                .filter((g): g is { metric: GoalMetric; target: number } => !!g && VALID.has(g.metric) && Number(g.target) > 0)
                .map((g) => ({ id: g.metric, metric: g.metric, target: Number(g.target) }));
              if (legacy.length > 0) current = await sellerRequest<ServerGoals>("sellers:goals:set", toServer(legacy));
            }
            localStorage.removeItem(LEGACY_KEY);
          } catch {
            /* storage unavailable or the server refused: the server copy (empty) stays */
          }
        }
        if (alive) {
          apply(current);
          setGoalsReady(true);
        }
      })
      .catch(() => alive && setGoalsReady(true));
    return () => {
      alive = false;
    };
  }, [status, access.loaded, canRead, canEdit, apply]);

  // The store row carries the goals too (owner copy): a change made in another browser shows up live.
  const liveGoals = seller?.goals;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the store's goals pushed by the server
    if (liveGoals) apply(liveGoals as Partial<ServerGoals>);
  }, [liveGoals, apply]);

  const saveGoals = useCallback(
    async (next: SellerGoal[]) => {
      const saved = await sellerRequest<ServerGoals>("sellers:goals:set", toServer(next));
      apply(saved);
    },
    [apply],
  );

  const value = useMemo(() => ({ goals, goalsReady, canEdit, saveGoals }), [goals, goalsReady, canEdit, saveGoals]);
  return <SellerGoalsContext.Provider value={value}>{children}</SellerGoalsContext.Provider>;
}

export function useSellerGoals() {
  const ctx = useContext(SellerGoalsContext);
  if (!ctx) throw new Error("useSellerGoals must be used within SellerGoalsProvider");
  return ctx;
}
