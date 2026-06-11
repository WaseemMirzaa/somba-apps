"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { MOCK_SUPPORT_TICKETS, type SupportTicket } from "@/lib/shared-entities";

type CreateTicketInput = {
  subject: string;
  message: string;
  orderId?: string;
  customer?: string;
  portal?: SupportTicket["portal"];
  priority?: SupportTicket["priority"];
};

type SupportContextType = {
  tickets: SupportTicket[];
  getTicket: (id: string) => SupportTicket | undefined;
  createTicket: (input: CreateTicketInput) => SupportTicket;
  addMessage: (ticketId: string, role: SupportTicket["messages"][0]["role"], author: string, text: string) => void;
  updateStatus: (ticketId: string, status: SupportTicket["status"]) => void;
};

const SupportContext = createContext<SupportContextType | null>(null);

let ticketSeq = 890;

export function SupportProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = useState(MOCK_SUPPORT_TICKETS);

  const getTicket = useCallback(
    (id: string) => tickets.find((t) => t.id === id),
    [tickets]
  );

  const createTicket = useCallback((input: CreateTicketInput) => {
    ticketSeq += 1;
    const id = `TKT-${ticketSeq}`;
    const now = new Date().toISOString().slice(0, 10);
    const created: SupportTicket = {
      id,
      subject: input.subject,
      orderId: input.orderId,
      customer: input.customer ?? "Marie Kabila",
      portal: input.portal ?? "customer",
      priority: input.priority ?? "medium",
      status: "open",
      createdAt: now,
      lastUpdate: now,
      messages: [
        {
          author: input.customer ?? "Marie Kabila",
          role: input.portal === "seller" ? "seller" : "customer",
          text: input.message,
          at: new Date().toISOString(),
        },
      ],
    };
    setTickets((prev) => [created, ...prev]);
    return created;
  }, []);

  const addMessage = useCallback(
    (ticketId: string, role: SupportTicket["messages"][0]["role"], author: string, text: string) => {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? {
                ...t,
                status: t.status === "open" && role === "agent" ? "in_progress" : t.status,
                lastUpdate: new Date().toISOString().slice(0, 10),
                messages: [...t.messages, { author, role, text, at: new Date().toISOString() }],
              }
            : t
        )
      );
    },
    []
  );

  const updateStatus = useCallback((ticketId: string, status: SupportTicket["status"]) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status, lastUpdate: new Date().toISOString().slice(0, 10) } : t))
    );
  }, []);

  return (
    <SupportContext.Provider value={{ tickets, getTicket, createTicket, addMessage, updateStatus }}>
      {children}
    </SupportContext.Provider>
  );
}

export function useSupport() {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error("useSupport must be used within SupportProvider");
  return ctx;
}
