"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { MOCK_DISPUTES, type DisputeItem } from "@/lib/shared-entities";

type DisputeContextType = {
  disputes: DisputeItem[];
  getDispute: (id: string) => DisputeItem | undefined;
  addMessage: (disputeId: string, from: "buyer" | "seller" | "admin", text: string) => void;
  resolveDispute: (id: string) => void;
};

const DisputeContext = createContext<DisputeContextType | null>(null);

export function DisputeProvider({ children }: { children: React.ReactNode }) {
  const [disputes, setDisputes] = useState(MOCK_DISPUTES);

  const getDispute = useCallback(
    (id: string) => disputes.find((d) => d.id === id),
    [disputes]
  );

  const addMessage = useCallback(
    (disputeId: string, from: "buyer" | "seller" | "admin", text: string) => {
      setDisputes((prev) =>
        prev.map((d) =>
          d.id === disputeId
            ? {
                ...d,
                status: from === "seller" ? "seller_responded" : d.status,
                messages: [...d.messages, { from, text, at: new Date().toISOString() }],
              }
            : d
        )
      );
    },
    []
  );

  const resolveDispute = useCallback((id: string) => {
    setDisputes((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "resolved" as const } : d))
    );
  }, []);

  return (
    <DisputeContext.Provider value={{ disputes, getDispute, addMessage, resolveDispute }}>
      {children}
    </DisputeContext.Provider>
  );
}

export function useDisputes() {
  const ctx = useContext(DisputeContext);
  if (!ctx) throw new Error("useDisputes must be used within DisputeProvider");
  return ctx;
}
