"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errorMessage } from "@/lib/warehouse-live";

/** A support ticket as `support:*` sends it to its owner (a rider or a warehouse member). */
export interface OpsTicket {
  id: string;
  reference: string;
  subject: string;
  category: string;
  orderId: string | null;
  status: "open" | "pending" | "resolved" | "closed";
  assigneeName?: string | null;
  userUnread: number;
  /** JSON array as stored by the server: `[{ id, from, fromId, role, text, at, attachments }]`. */
  messages: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpsTicketMessage {
  id?: string;
  from: string;
  fromId?: string;
  role: string;
  text: string;
  at: string;
  attachments?: string[];
}

export function ticketThread(t: Pick<OpsTicket, "messages">): OpsTicketMessage[] {
  try {
    const list = JSON.parse(t.messages || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export const TICKET_STATUS: Record<string, { en: string; fr: string }> = {
  open: { en: "Open", fr: "Ouvert" },
  pending: { en: "Answered", fr: "Répondu" },
  resolved: { en: "Resolved", fr: "Résolu" },
  closed: { en: "Closed", fr: "Fermé" },
};

function upsert(list: OpsTicket[], t: OpsTicket): OpsTicket[] {
  return [t, ...list.filter((x) => x.id !== t.id)].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

/** The caller's own tickets, kept live by `support:updated`. */
export function useOpsTickets() {
  const rt = useRealtime();
  const [tickets, setTickets] = useState<OpsTicket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = rt.status === "connected" && !!rt.user;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    socketClient
      .request<OpsTicket[]>("support:list")
      .then((l) => {
        if (!alive) return;
        setTickets(l);
        setError(null);
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoaded(true));
    const s = socketClient.current;
    const onUpd = (t: OpsTicket) => setTickets((cur) => upsert(cur, t));
    s?.on("support:updated", onUpd);
    return () => {
      alive = false;
      s?.off("support:updated", onUpd);
    };
  }, [ready]);

  const put = useCallback((t: OpsTicket) => setTickets((cur) => upsert(cur, t)), []);
  const unread = tickets.reduce((n, t) => n + (t.userUnread || 0), 0);
  return { tickets, loaded, error, put, unread };
}
