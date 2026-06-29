"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { sellerGoals } from "@/lib/seller-analytics";

/** How a goal's current/target values are rendered. */
export type GoalMetric = "currency" | "number" | "percent";

export type SellerGoal = {
  id: string;
  label: string;
  labelFr: string;
  metric: GoalMetric;
  current: number;
  target: number;
};

type SellerGoalsContextType = {
  goals: SellerGoal[];
  goalsReady: boolean;
  /** Replace the whole set of goals (used by the settings editor). */
  saveGoals: (next: SellerGoal[]) => void;
  /** Restore the default monthly goals. */
  resetGoals: () => void;
};

const STORAGE_KEY = "somba-teka-seller-goals";

/** Seeded from the seller analytics data so the dashboard looks the same on first load. */
const DEFAULT_GOALS: SellerGoal[] = [
  { id: "revenue", label: "Revenue goal", labelFr: "Objectif revenu", metric: "currency", current: sellerGoals.revenueCurrent, target: sellerGoals.revenueTarget },
  { id: "orders", label: "Orders goal", labelFr: "Objectif commandes", metric: "number", current: sellerGoals.ordersCurrent, target: sellerGoals.ordersTarget },
  { id: "retention", label: "Retention goal", labelFr: "Objectif rétention", metric: "percent", current: sellerGoals.retentionCurrent, target: sellerGoals.retentionTarget },
];

const SellerGoalsContext = createContext<SellerGoalsContextType | null>(null);

export function newGoalId() {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function SellerGoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<SellerGoal[]>(DEFAULT_GOALS);
  const [goalsReady, setGoalsReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted state from localStorage after mount (SSR-safe; a lazy initializer would cause a hydration mismatch)
        if (Array.isArray(parsed)) setGoals(parsed);
      }
    } catch {
      /* ignore */
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

  const resetGoals = useCallback(() => {
    setGoals(DEFAULT_GOALS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <SellerGoalsContext.Provider value={{ goals, goalsReady, saveGoals, resetGoals }}>
      {children}
    </SellerGoalsContext.Provider>
  );
}

export function useSellerGoals() {
  const ctx = useContext(SellerGoalsContext);
  if (!ctx) throw new Error("useSellerGoals must be used within SellerGoalsProvider");
  return ctx;
}
