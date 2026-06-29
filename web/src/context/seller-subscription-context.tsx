"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
type PlanId = "starter" | "pro" | "enterprise";

export type SellerSubscription = {
  sellerId: string;
  planId: PlanId;
  active: boolean;
  expiresAt: string;
};

type SellerSubscriptionContextType = {
  subscriptions: Record<string, SellerSubscription>;
  subscriptionReady: boolean;
  hasActiveSubscription: (sellerId: string) => boolean;
  getSubscription: (sellerId: string) => SellerSubscription | undefined;
  purchasePlan: (sellerId: string, planId: PlanId) => void;
  cancelSubscription: (sellerId: string) => void;
};

const STORAGE_KEY = "somba-seller-subscriptions";

const DEFAULT_SUBSCRIPTIONS: Record<string, SellerSubscription> = {
  "seller-1": {
    sellerId: "seller-1",
    planId: "pro",
    active: true,
    expiresAt: "2026-12-31",
  },
};

const SellerSubscriptionContext = createContext<SellerSubscriptionContextType | null>(null);

export function SellerSubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [subscriptions, setSubscriptions] = useState<Record<string, SellerSubscription>>(DEFAULT_SUBSCRIPTIONS);
  const [subscriptionReady, setSubscriptionReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted state from localStorage after mount (SSR-safe; a lazy initializer would cause a hydration mismatch)
      if (stored) setSubscriptions({ ...DEFAULT_SUBSCRIPTIONS, ...JSON.parse(stored) });
    } catch {
      /* ignore */
    }
    setSubscriptionReady(true);
  }, []);

  const persist = useCallback((next: Record<string, SellerSubscription>) => {
    setSubscriptions(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const hasActiveSubscription = useCallback(
    (sellerId: string) => subscriptions[sellerId]?.active === true,
    [subscriptions]
  );

  const getSubscription = useCallback(
    (sellerId: string) => subscriptions[sellerId],
    [subscriptions]
  );

  const purchasePlan = useCallback(
    (sellerId: string, planId: PlanId) => {
      const expires = new Date();
      expires.setMonth(expires.getMonth() + 1);
      persist({
        ...subscriptions,
        [sellerId]: {
          sellerId,
          planId,
          active: true,
          expiresAt: expires.toISOString().slice(0, 10),
        },
      });
    },
    [subscriptions, persist]
  );

  const cancelSubscription = useCallback(
    (sellerId: string) => {
      const current = subscriptions[sellerId];
      if (!current) return;
      persist({
        ...subscriptions,
        [sellerId]: { ...current, active: false },
      });
    },
    [subscriptions, persist]
  );

  return (
    <SellerSubscriptionContext.Provider
      value={{
        subscriptions,
        subscriptionReady,
        hasActiveSubscription,
        getSubscription,
        purchasePlan,
        cancelSubscription,
      }}
    >
      {children}
    </SellerSubscriptionContext.Provider>
  );
}

export function useSellerSubscription() {
  const ctx = useContext(SellerSubscriptionContext);
  if (!ctx) throw new Error("useSellerSubscription must be used within SellerSubscriptionProvider");
  return ctx;
}
