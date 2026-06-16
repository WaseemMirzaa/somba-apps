"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getSupportTicket } from "@/lib/seller-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function SellerSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ticket = getSupportTicket(id);
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<{ author: string; text: string; time: string }[]>([]);

  if (!ticket) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Ticket introuvable" : "Ticket not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.id}
        subtitle={`${fr ? ticket.categoryFr : ticket.category} · ${fr ? ticket.subjectFr : ticket.subject}`}
        backHref="/seller/support"
        actions={<Badge variant={ticket.status === "resolved" ? "success" : "warning"}>{fr ? ticket.statusFr : ticket.status}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Conversation" : "Conversation"} span={2}>
          <div className="space-y-4">
            <div className="rounded-lg bg-sky-50 p-4 text-sm">
              <p className="font-medium">{fr ? "Vous" : "You"}</p>
              <p className="mt-1">{fr ? ticket.subjectFr : ticket.subject} {fr ? "— merci de m'indiquer les prochaines étapes." : "— please advise on next steps."}</p>
              <p className="mt-1 text-xs text-slate-400">{ticket.lastUpdate}</p>
            </div>
            {ticket.status === "resolved" && (
              <div className="rounded-lg bg-emerald-50 p-4 text-sm">
                <p className="font-medium">{fr ? "Agent de support" : "Support Agent"}</p>
                <p className="mt-1">{fr ? "Problème résolu. Le versement sera traité sous 48 heures." : "Issue resolved. Payout will process within 48 hours."}</p>
              </div>
            )}
          </div>
          {messages.map((m, i) => (
            <div key={i} className={`rounded-lg p-4 text-sm ${m.author === "You" ? "bg-sky-50" : "bg-emerald-50"}`}>
              <p className="font-medium">{m.author === "You" ? (fr ? "Vous" : "You") : m.author}</p>
              <p className="mt-1">{m.text}</p>
            </div>
          ))}
          <textarea className="mt-4 w-full rounded-lg border border-sky-200 p-3 text-sm" placeholder={fr ? "Répondre..." : "Reply..."} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
          <button
            onClick={() => {
              if (!reply.trim()) return;
              setMessages((m) => [...m, { author: "You", text: reply, time: "Just now" }]);
              setReply("");
              toast(fr ? "Réponse envoyée" : "Reply sent");
            }}
            className="mt-2 btn-primary rounded-lg px-4 py-2 text-sm"
          >
            {fr ? "Envoyer la réponse" : "Send Reply"}
          </button>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Pièces jointes" : "Attachments"}>
          <p className="text-sm text-slate-500">{fr ? "Aucune pièce jointe." : "No attachments."}</p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={[
            { time: ticket.lastUpdate, label: fr ? "Dernière mise à jour" : "Last updated", done: true },
            { time: "2024-06-04", label: fr ? "Agent assigné" : "Agent assigned", done: true },
            { time: "2024-06-03", label: fr ? "Ticket créé" : "Ticket created", done: true },
          ]} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
