"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { MOCK_RETURNS, type ReturnItem } from "@/lib/shared-entities";

type CreateReturnInput = {
  orderId: string;
  items: string[];
  reason: string;
  refundAmount?: number;
};

type ReturnContextType = {
  returns: ReturnItem[];
  getReturn: (id: string) => ReturnItem | undefined;
  createReturn: (input: CreateReturnInput) => ReturnItem;
};

const ReturnContext = createContext<ReturnContextType | null>(null);

export function ReturnProvider({ children }: { children: React.ReactNode }) {
  const [returns, setReturns] = useState(MOCK_RETURNS);

  const getReturn = useCallback(
    (id: string) => returns.find((r) => r.id === id),
    [returns]
  );

  const createReturn = useCallback((input: CreateReturnInput) => {
    const suffix = input.orderId.replace("ORD-", "");
    const id = `RET-${suffix}`;
    const created: ReturnItem = {
      id,
      orderId: input.orderId,
      status: "requested",
      items: input.items,
      reason: input.reason,
      createdAt: new Date().toISOString().slice(0, 10),
      refundAmount: input.refundAmount,
      timeline: [
        { time: new Date().toISOString().slice(0, 10), label: "Return requested", done: true },
        { time: "Pending", label: "Seller review", done: false },
      ],
    };
    setReturns((prev) => [created, ...prev.filter((r) => r.id !== id)]);
    return created;
  }, []);

  return (
    <ReturnContext.Provider value={{ returns, getReturn, createReturn }}>
      {children}
    </ReturnContext.Provider>
  );
}

export function useReturns() {
  const ctx = useContext(ReturnContext);
  if (!ctx) throw new Error("useReturns must be used within ReturnProvider");
  return ctx;
}
