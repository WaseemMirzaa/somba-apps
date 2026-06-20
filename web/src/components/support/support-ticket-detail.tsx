"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSupport } from "@/context/support-context";
import { SupportChat } from "@/components/support/support-chat";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_PRIORITY_LABELS,
  type SupportSender,
  type SupportStatus,
  type SupportAttachment,
} from "@/lib/support-tickets";

const STATUS_VARIANT: Record<SupportStatus, "success" | "warning" | "info"> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
};

/** Shared ticket detail used by the admin, seller and customer portals. */
export function SupportTicketDetail({
  perspective,
  backHref,
}: {
  perspective: SupportSender;
  backHref: string;
}) {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { getTicket, sendMessage, setStatus } = useSupport();
  const ticket = getTicket(id);

  if (!ticket) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Ticket introuvable" : "Ticket not found"}</div>;
  }

  function handleSend(text: string, attachments: SupportAttachment[]) {
    if (!ticket) return;
    sendMessage(ticket.id, { from: perspective, text, attachments, at: new Date().toISOString() });
    toast(fr ? "Message envoyé" : "Message sent");
  }

  const isAgent = perspective === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.id}
        subtitle={`${fr ? ticket.categoryFr : ticket.category} · ${fr ? ticket.subjectFr : ticket.subject}`}
        backHref={backHref}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={ticket.priority === "high" ? "danger" : ticket.priority === "medium" ? "warning" : "default"}>
              {fr ? SUPPORT_PRIORITY_LABELS[ticket.priority].fr : SUPPORT_PRIORITY_LABELS[ticket.priority].en}
            </Badge>
            <Badge variant={STATUS_VARIANT[ticket.status]}>
              {fr ? SUPPORT_STATUS_LABELS[ticket.status].fr : SUPPORT_STATUS_LABELS[ticket.status].en}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SupportChat messages={ticket.messages} perspective={perspective} onSend={handleSend} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5 text-sm">
              <p className="font-semibold text-slate-900">{fr ? "Détails du ticket" : "Ticket details"}</p>
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Demandeur" : "Raised by"}</span><span className="font-medium">{ticket.party}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Catégorie" : "Category"}</span><span>{fr ? ticket.categoryFr : ticket.category}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Portail" : "Portal"}</span><span className="capitalize">{ticket.audience}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Créé le" : "Created"}</span><span>{ticket.date}</span></div>
            </CardContent>
          </Card>

          {isAgent && (
            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="text-sm font-semibold text-slate-900">{fr ? "Mettre à jour le statut" : "Update status"}</p>
                <div className="flex flex-wrap gap-2">
                  {(["open", "in_progress", "resolved"] as SupportStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setStatus(ticket.id, s);
                        toast(fr ? "Statut mis à jour" : "Status updated");
                      }}
                      className={
                        ticket.status === s
                          ? "rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                          : "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      }
                    >
                      {fr ? SUPPORT_STATUS_LABELS[s].fr : SUPPORT_STATUS_LABELS[s].en}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
