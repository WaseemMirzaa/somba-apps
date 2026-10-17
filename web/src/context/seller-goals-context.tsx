"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { SellerAnalytics } from "@/lib/seller-analytics";

/**
 * Personal targets for the last 30 days. Only the TARGET is stored (in this
 * browser: the server has no goals feature); the "current" value is always the
 * live figure from `analytics:seller`, never something typed by hand.
 */
export type GoalMetric = "revenue" | "orders" | "rating" | "repeat";

export type SellerGoal = {
  id: string;
  metric: GoalMetric;
  target: number;
};

export const GOAL_METRICS: {
  value: GoalMetric;
  label: string;
  labelFr: string;
  kind: "currency" | "number" | "rating" | "percent";
  /** Current value, from the 30-day analytics (null = no data to judge yet). */
  current: (a: SellerAnalytics) => number | null;
}[] = [
  { value: "revenue", label: "Revenue (30 days)", labelFr: "Revenu (30 jours)", kind: "currency", current: (a) => a.revenue },
  { value: "orders", label: "Orders (30 days)", labelFr: "Commandes (30 jours)", kind: "number", current: (a) => a.orders },
  { value: "rating", label: "Average rating", labelFr: "Note moyenne", kind: "rating", current: (a) => a.reviews.average },
  { value: "repeat", label: "Repeat buyers", labelFr: "Clients récurrents", kind: "percent", current: (a) => (a.customers.total > 0 ? a.customers.repeatRatePct : null) },
];

type SellerGoalsContextType = {
  goals: SellerGoal[];
  goalsReady: boolean;
  /** Replace the whole set of goals (used by the settings editor). */
  saveGoals: (next: SellerGoal[]) => void;
};

const STORAGE_KEY = "somba-teka-seller-goals-v2";
const VALID = new Set<string>(GOAL_METRICS.map((m) => m.value));

const SellerGoalsContext = createContext<SellerGoalsContextType | null>(null);

export function newGoalId() {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function SellerGoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<SellerGoal[]>([]);
  const [goalsReady, setGoalsReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-stored targets once on mount
          setGoals(
            parsed.filter(
              (g): g is SellerGoal => !!g && VALID.has(g.metric) && Number.isFinite(Number(g.target)) && Number(g.target) > 0,
            ),
          );
        }
      }
    } catch {
      /* storage unavailable: no goals */
    }
    setGoalsReady(true);
  }, []);

  const saveGoals = useCallback((next: SellerGoal[]) => {
    setGoals(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <SellerGoalsContext.Provider value={{ goals, goalsReady, saveGoals }}>
      {children}
    </SellerGoalsContext.Provider>
  );
}

export function useSellerGoals() {
  const ctx = useContext(SellerGoalsContext);
  if (!ctx) throw new Error("useSellerGoals must be used within SellerGoalsProvider");
  return ctx;
}
