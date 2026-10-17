"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerLoad, useSellerTickets } from "@/lib/seller";
import { errMessage, ticketStatusLabel, ticketStatusVariant } from "@/lib/seller-labels";

export default function SellerSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { tickets, replyTicket } = useSellerTickets();
  const load = useSellerLoad();
  const ticket = tickets.find((tk) => tk.id === id || tk.reference === id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ticket) return <MissingRecord load={load} label="Ticket not found" labelFr="Ticket introuvable" />;

  const closed = ticket.status === "closed";

  async function send() {
    if (!ticket || !text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await replyTicket(ticket.id, text.trim());
      setText("");
      toast(fr ? "Message envoyé" : "Message sent");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.reference}
        subtitle={ticket.subject}
        backHref="/seller/support"
        actions={<Badge variant={ticketStatusVariant(ticket.status)}>{ticketStatusLabel(ticket.status, fr)}</Badge>}
      />

      <Card>
        <CardContent className="space-y-3 p-5">
          {ticket.messages.length === 0 && (
            <p className="text-sm text-slate-500">{fr ? "Aucun message." : "No messages."}</p>
          )}
          {ticket.messages.map((m, i) => {
            const staff = m.role !== "customer" && m.role !== "seller";
            return (
              <div key={i} className={`flex ${staff ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${staff ? "bg-slate-100 text-slate-800" : "bg-[var(--primary)] text-white"}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${staff ? "text-slate-500" : "text-white/70"}`}>
                    {staff ? (fr ? "Support" : "Support") : fr ? "Vous" : "You"} · {new Date(m.at).toLocaleString(locale)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{m.text}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {closed ? (
        <p className="text-sm text-slate-500">{fr ? "Ce ticket est fermé. Ouvrez-en un nouveau pour une autre demande." : "This ticket is closed. Open a new one for another request."}</p>
      ) : (
        <div className="space-y-2">
          <textarea className="input-premium w-full px-3 py-2 text-sm" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={fr ? "Votre réponse…" : "Your reply…"} maxLength={4000} />
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button onClick={() => void send()} disabled={!text.trim() || busy}>{busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer" : "Send"}</Button>
        </div>
      )}
    </div>
  );
}
