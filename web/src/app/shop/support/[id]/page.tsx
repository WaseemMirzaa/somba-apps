"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { PhotoPicker } from "@/components/shop/photo-picker";
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ticket = tickets.find((t) => t.id === id || t.reference === id);

  // Opening the ticket (and every staff message that lands while it is open) marks it read.
  const ticketId = ticket?.id;
  const unread = ticket?.userUnread ?? 0;
  useEffect(() => {
    if (!ticketId || unread <= 0) return;
    socketClient.request<SupportTicketRow>("support:markRead", { id: ticketId }).then(put).catch(() => {});
  }, [ticketId, unread, put]);

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
    if ((!text.trim() && photos.length === 0) || !ticket) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await socketClient.request<SupportTicketRow>("support:reply", { id: ticket.id, text: text.trim() || undefined, ...(photos.length ? { attachments: photos } : {}) });
      put(saved);
      setText("");
      setPhotos([]);
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
                {mine ? (fr ? "Vous" : "You") : `${m.from} · ${fr ? "Support Somba" : "Somba support"}`} · {new Date(m.at).toLocaleString()}
              </p>
              {m.text && <p className="mt-1 whitespace-pre-wrap text-slate-800">{m.text}</p>}
              {(m.attachments ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(m.attachments ?? []).map((u) => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-[var(--border)] bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={fr ? "Photo jointe" : "Attached photo"} className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
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
          <PhotoPicker value={photos} onChange={setPhotos} max={4} fr={fr} />
          <Button type="submit" disabled={busy || (!text.trim() && photos.length === 0)}>{busy ? "…" : fr ? "Envoyer" : "Send"}</Button>
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
