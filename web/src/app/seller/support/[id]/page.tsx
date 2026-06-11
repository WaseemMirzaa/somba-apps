"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSupport } from "@/context/support-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { localizedField, statusLabel, timelineLabel } from "@/lib/locale-helpers";

export default function SellerSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { getTicket, addMessage } = useSupport();
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const ticket = getTicket(id);
  const [reply, setReply] = useState("");

  if (!ticket) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.id}
        subtitle={localizedField(locale, ticket.subject, ticket.subjectFr)}
        backHref="/seller/support"
        actions={<Badge variant={ticket.status === "resolved" ? "success" : "warning"}>{statusLabel(locale, ticket.status)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Conversation" : "Conversation"} span={2}>
          <div className="space-y-3">
            {ticket.messages.map((m, i) => (
              <div key={i} className={`rounded-lg p-4 text-sm ${m.role === "seller" ? "bg-sky-50" : "bg-emerald-50"}`}>
                <p className="text-xs font-medium uppercase text-slate-400">{m.author}</p>
                <p className="mt-1">{localizedField(locale, m.text, m.textFr)}</p>
              </div>
            ))}
          </div>
          {ticket.status !== "resolved" && (
            <>
              <textarea className="mt-4 w-full rounded-lg border border-sky-200 p-3 text-sm" placeholder={fr ? "Répondre..." : "Reply..."} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button onClick={() => { if (!reply.trim()) return; addMessage(id, "seller", "TechZone Store", reply); setReply(""); toast(fr ? "Réponse envoyée" : "Reply sent"); }} className="mt-2">{fr ? "Envoyer" : "Send Reply"}</Button>
            </>
          )}
        </DetailGridSection>

        <DetailGridSection title={t("details")}>
          <p className="text-sm"><strong>{fr ? "Priorité" : "Priority"}:</strong> {ticket.priority}</p>
          <p className="mt-2 text-sm"><strong>{fr ? "Dernière mise à jour" : "Last update"}:</strong> {ticket.lastUpdate}</p>
          {ticket.orderId && (
            <Link href={`/seller/orders/${ticket.orderId}`} className="mt-4 inline-block text-sm text-sky-600 hover:underline">{fr ? "Voir commande →" : "View order →"}</Link>
          )}
        </DetailGridSection>

        <DetailGridSection title={t("timeline")} span={3}>
          <ActivityTimeline events={[
            { time: ticket.createdAt, label: timelineLabel(locale, "Ticket created", "Ticket créé"), done: true },
            { time: ticket.lastUpdate, label: timelineLabel(locale, "Last updated", "Dernière mise à jour"), done: true },
          ]} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
