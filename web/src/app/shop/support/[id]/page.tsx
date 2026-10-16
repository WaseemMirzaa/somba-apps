"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSupportTickets, ticketMessages, ticketStatusLabel, type SupportTicketRow } from "@/lib/shop-live";

function TicketThread() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { tickets, loaded, put } = useSupportTickets();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ticket = tickets.find((t) => t.id === id || t.reference === id);

  if (!ticket) {
    return (
      <div className="space-y-3 py-12 text-center text-slate-500">
        <p>{loaded ? (fr ? "Ticket introuvable" : "Ticket not found") : (fr ? "Chargement…" : "Loading…")}</p>
        <Link href="/shop/support" className="text-[var(--primary)] hover:underline">{fr ? "Mes tickets" : "My tickets"}</Link>
      </div>
    );
  }

  const messages = ticketMessages(ticket);
  const closed = ticket.status === "closed";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !ticket) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await socketClient.request<SupportTicketRow>("support:reply", { id: ticket.id, text: text.trim() });
      put(saved);
      setText("");
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={ticket.subject} subtitle={ticket.reference} backHref="/shop/support" actions={<Badge variant={ticket.status === "resolved" || ticket.status === "closed" ? "success" : ticket.status === "pending" ? "info" : "warning"}>{ticketStatusLabel(ticket.status, fr)}</Badge>} />

      {ticket.orderId && (
        <Link href={`/shop/orders/${ticket.orderId}`} className="text-sm text-[var(--primary)] hover:underline">
          {fr ? "Voir la commande liée →" : "View linked order →"}
        </Link>
      )}

      <div className="space-y-3">
        {messages.map((m, i) => {
          const mine = m.role === "customer";
          return (
            <div key={i} className={`rounded-xl p-4 text-sm ${mine ? "ml-8 bg-blue-50" : "mr-8 bg-slate-50"}`}>
              <p className="text-xs font-medium text-slate-400">
                {mine ? (fr ? "Vous" : "You") : `${m.from} · ${fr ? "Support" : "Support"}`} · {new Date(m.at).toLocaleString()}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{m.text}</p>
            </div>
          );
        })}
      </div>

      {closed ? (
        <p className="text-center text-sm text-slate-500">{fr ? "Ce ticket est fermé." : "This ticket is closed."}</p>
      ) : (
        <form onSubmit={send} className="card-premium space-y-3 p-4">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Votre réponse..." : "Your reply..."} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy || !text.trim()}>{busy ? "…" : fr ? "Envoyer" : "Send"}</Button>
        </form>
      )}
    </div>
  );
}

export default function ShopSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/support/${id}`}>
      <TicketThread />
    </RequireSignIn>
  );
}
