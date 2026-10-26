"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { UserCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MissingRecord } from "@/components/seller/data-state";
import { AttachmentGallery, AttachmentPicker } from "@/components/seller/attachments";
import { OrderLink, useOrderRefs } from "@/components/seller/engage-support";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerLoad, useSellerTickets } from "@/lib/seller";
import { errMessage, ticketStatusLabel, ticketStatusVariant } from "@/lib/seller-labels";
import { senderRoleLabel } from "@/lib/seller-engage";
import { supportCategoryLabel } from "@/lib/i18n-fields";

export default function SellerSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { tickets, replyTicket, markTicketRead } = useSellerTickets();
  const { refOf, canLink } = useOrderRefs();
  const load = useSellerLoad();
  const ticket = tickets.find((tk) => tk.id === id || tk.reference === id);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening the ticket reads it; a staff reply that arrives while it is open is read at once.
  const unread = ticket?.userUnread ?? 0;
  const ticketId = ticket?.id;
  const reading = useRef(false);
  useEffect(() => {
    if (!ticketId || unread <= 0 || reading.current) return;
    reading.current = true;
    void markTicketRead(ticketId)
      .catch(() => undefined)
      .finally(() => {
        reading.current = false;
      });
  }, [ticketId, unread, markTicketRead]);

  if (!ticket) return <MissingRecord load={load} label="Ticket not found" labelFr="Ticket introuvable" />;

  const closed = ticket.status === "closed";

  async function send() {
    if (!ticket || (!text.trim() && photos.length === 0) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await replyTicket(ticket.id, text.trim(), photos);
      setText("");
      setPhotos([]);
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>
          {fr ? "Catégorie" : "Category"} : <strong className="text-slate-800">{supportCategoryLabel(ticket.category, fr) || "—"}</strong>
        </span>
        {ticket.orderId && (
          <span>
            {fr ? "Commande" : "Order"} : <OrderLink orderId={ticket.orderId} reference={refOf(ticket.orderId)} fr={fr} enabled={canLink} />
          </span>
        )}
        {ticket.assigneeName && (
          <span className="inline-flex items-center gap-1">
            <UserCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            {fr ? "Pris en charge par" : "Handled by"} <strong className="text-slate-800">{ticket.assigneeName}</strong>
          </span>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3 p-5" data-testid="ticket-thread">
          {ticket.messages.length === 0 && (
            <p className="text-sm text-slate-500">{fr ? "Aucun message." : "No messages."}</p>
          )}
          {ticket.messages.map((m, i) => {
            const mine = m.role === "seller" || m.fromId === ticket.userId;
            return (
              <div key={m.id ?? i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-800"}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${mine ? "text-white/70" : "text-slate-500"}`}>
                    {mine ? (m.from && m.from !== ticket.userName ? `${m.from} · ` : "") + senderRoleLabel("seller", fr) : `${m.from ? `${m.from} · ` : ""}${senderRoleLabel(m.role, fr)}`} · {new Date(m.at).toLocaleString(locale)}
                  </p>
                  {m.text && <p className="mt-1 whitespace-pre-wrap break-words">{m.text}</p>}
                  <AttachmentGallery urls={m.attachments} className="mt-2" />
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
          <textarea className="input-premium w-full px-3 py-2 text-sm" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={fr ? "Votre réponse…" : "Your reply…"} aria-label={fr ? "Votre réponse" : "Your reply"} maxLength={4000} />
          <AttachmentPicker value={photos} onChange={setPhotos} max={4} disabled={busy} />
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button onClick={() => void send()} disabled={(!text.trim() && photos.length === 0) || busy}>{busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer" : "Send"}</Button>
        </div>
      )}
    </div>
  );
}
