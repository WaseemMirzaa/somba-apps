"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import {
  SUPPORT_STATUS_BADGE,
  SUPPORT_STATUS_LABEL,
  errMsg,
  parseMessages,
  useServerList,
  type SupportTicketRow,
} from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

export default function AdminSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { items, setItems, loading } = useServerList<SupportTicketRow>("support:list", { pushEvents: ["support:updated"] });
  const ticket = items.find((t) => t.id === id || t.reference === id);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  if (!ticket) {
    return (
      <div className="p-8 text-center text-slate-500">
        {loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Ticket introuvable" : "Ticket not found"}
      </div>
    );
  }

  const messages = parseMessages(ticket.messages);

  async function send() {
    if (!ticket || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const saved = await socketClient.request<SupportTicketRow>("support:reply", { id: ticket.id, text: text.trim() });
      setItems((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      setText("");
      toast(fr ? "Réponse envoyée" : "Reply sent", "success");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: SupportTicketRow["status"]) {
    if (!ticket) return;
    setStatusBusy(true);
    try {
      const saved = await socketClient.request<SupportTicketRow>("support:setStatus", { id: ticket.id, status });
      setItems((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      toast(fr ? "Statut mis à jour" : "Status updated", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.reference}
        subtitle={`${ticket.category} · ${ticket.subject}`}
        backHref="/admin/support"
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Support" : "Support", href: "/admin/support" }, { label: ticket.reference }]}
        actions={<Badge variant={SUPPORT_STATUS_BADGE[ticket.status] ?? "default"}>{SUPPORT_STATUS_LABEL[ticket.status]?.[fr ? "fr" : "en"] ?? ticket.status}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="space-y-3 p-5">
              {messages.length === 0 && <p className="text-sm text-slate-400">{fr ? "Aucun message." : "No messages."}</p>}
              {messages.map((m, i) => {
                const staff = m.role.startsWith("admin");
                return (
                  <div key={i} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${staff ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-800"}`}>
                      <p className={`mb-0.5 text-xs ${staff ? "text-white/70" : "text-slate-400"}`}>{m.from} · {m.at.slice(0, 16).replace("T", " ")}</p>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <textarea
                className="input-premium w-full px-4 py-2 text-sm"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={fr ? "Votre réponse au client…" : "Your reply to the customer…"}
                disabled={ticket.status === "closed"}
              />
              <ErrorNote message={error} />
              <Button size="sm" onClick={send} disabled={sending || !text.trim() || ticket.status === "closed"}>
                {sending ? "…" : fr ? "Envoyer la réponse" : "Send reply"}
              </Button>
              {ticket.status === "closed" && <p className="text-xs text-slate-400">{fr ? "Ticket fermé : rouvrez-le pour répondre." : "Ticket closed: reopen it to reply."}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5 text-sm">
              <p className="font-semibold text-slate-900">{fr ? "Détails du ticket" : "Ticket details"}</p>
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Demandeur" : "Raised by"}</span><Link href={`/admin/customers/${ticket.userId}`} className="font-medium text-[var(--primary)] hover:underline">{ticket.userName}</Link></div>
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Catégorie" : "Category"}</span><span className="capitalize">{ticket.category}</span></div>
              {ticket.orderId && (
                <div className="flex justify-between"><span className="text-slate-500">{fr ? "Commande" : "Order"}</span><Link href={`/admin/orders/${ticket.orderId}`} className="text-[var(--primary)] hover:underline">{fr ? "Voir" : "View"}</Link></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Créé le" : "Created"}</span><span>{ticket.createdAt.slice(0, 10)}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-900">{fr ? "Mettre à jour le statut" : "Update status"}</p>
              <div className="flex flex-wrap gap-2">
                {(["open", "pending", "resolved", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    disabled={statusBusy || ticket.status === s}
                    onClick={() => setStatus(s)}
                    className={
                      ticket.status === s
                        ? "rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                        : "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    }
                  >
                    {SUPPORT_STATUS_LABEL[s][fr ? "fr" : "en"]}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
