"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  SUPPORT_TICKETS,
  type SupportTicket,
  type SupportMessage,
  type SupportStatus,
} from "@/lib/support-tickets";

/** Runtime support tickets — shared across admin/seller/customer portals so a
 *  message sent in one is visible in the others. Persisted to localStorage. */

export type NewTicketInput = {
  subject: string;
  subjectFr?: string;
  category: string;
  categoryFr?: string;
  audience: "customer" | "seller";
  party: string;
  priority?: "low" | "medium" | "high";
  message: string;
};

type SupportContextType = {
  tickets: SupportTicket[];
  getTicket: (id: string) => SupportTicket | undefined;
  sendMessage: (id: string, message: SupportMessage) => void;
  setStatus: (id: string, status: SupportStatus) => void;
  addTicket: (input: NewTicketInput) => string;
};

const SupportContext = createContext<SupportContextType | null>(null);
const STORAGE_KEY = "somba-support";

export function SupportProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = useState<SupportTicket[]>(SUPPORT_TICKETS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted state from localStorage after mount (SSR-safe; a lazy initializer would cause a hydration mismatch)
      if (raw) setTickets(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const save = useCallback((next: SupportTicket[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const getTicket = useCallback((id: string) => tickets.find((t) => t.id === id), [tickets]);

  const sendMessage = useCallback(
    (id: string, message: SupportMessage) => {
      setTickets((prev) => {
        const next = prev.map((t) =>
          t.id === id
            ? {
                ...t,
                messages: [...t.messages, message],
                status: t.status === "resolved" ? "in_progress" : t.status,
              }
            : t
        );
        save(next);
        return next;
      });
    },
    [save]
  );

  const setStatus = useCallback(
    (id: string, status: SupportStatus) => {
      setTickets((prev) => {
        const next = prev.map((t) => (t.id === id ? { ...t, status } : t));
        save(next);
        return next;
      });
    },
    [save]
  );

  const addTicket = useCallback(
    (input: NewTicketInput) => {
      const id = `TKT-${Date.now().toString().slice(-5)}`;
      const ticket: SupportTicket = {
        id,
        subject: input.subject,
        subjectFr: input.subjectFr ?? input.subject,
        category: input.category,
        categoryFr: input.categoryFr ?? input.category,
        audience: input.audience,
        party: input.party,
        priority: input.priority ?? "medium",
        status: "open",
        date: new Date().toISOString().slice(0, 10),
        messages: [{ from: input.audience, text: input.message, at: new Date().toISOString() }],
      };
      setTickets((prev) => {
        const next = [ticket, ...prev];
        save(next);
        return next;
      });
      return id;
    },
    [save]
  );

  return (
    <SupportContext.Provider value={{ tickets, getTicket, sendMessage, setStatus, addTicket }}>
      {children}
    </SupportContext.Provider>
  );
}

export function useSupport() {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error("useSupport must be used within SupportProvider");
  return ctx;
}
