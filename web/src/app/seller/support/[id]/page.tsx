"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getSupportTicket } from "@/lib/seller-entities";
import { useToast } from "@/context/toast-context";

export default function SellerSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const ticket = getSupportTicket(id);
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<{ author: string; text: string; time: string }[]>([]);

  if (!ticket) {
    return <div className="p-8 text-center text-slate-500">Ticket not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.id}
        subtitle={`${ticket.category} · ${ticket.subject}`}
        backHref="/seller/support"
        actions={<Badge variant={ticket.status === "resolved" ? "success" : "warning"}>{ticket.status}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title="Conversation" span={2}>
          <div className="space-y-4">
            <div className="rounded-lg bg-sky-50 p-4 text-sm">
              <p className="font-medium">You</p>
              <p className="mt-1">{ticket.subject} — please advise on next steps.</p>
              <p className="mt-1 text-xs text-slate-400">{ticket.lastUpdate}</p>
            </div>
            {ticket.status === "resolved" && (
              <div className="rounded-lg bg-emerald-50 p-4 text-sm">
                <p className="font-medium">Support Agent</p>
                <p className="mt-1">Issue resolved. Payout will process within 48 hours.</p>
              </div>
            )}
          </div>
          {messages.map((m, i) => (
            <div key={i} className={`rounded-lg p-4 text-sm ${m.author === "You" ? "bg-sky-50" : "bg-emerald-50"}`}>
              <p className="font-medium">{m.author}</p>
              <p className="mt-1">{m.text}</p>
            </div>
          ))}
          <textarea className="mt-4 w-full rounded-lg border border-sky-200 p-3 text-sm" placeholder="Reply..." rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
          <button
            onClick={() => {
              if (!reply.trim()) return;
              setMessages((m) => [...m, { author: "You", text: reply, time: "Just now" }]);
              setReply("");
              toast("Reply sent");
            }}
            className="mt-2 rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
          >
            Send Reply
          </button>
        </DetailGridSection>

        <DetailGridSection title="Attachments">
          <p className="text-sm text-slate-500">No attachments.</p>
        </DetailGridSection>

        <DetailGridSection title="Timeline" span={3}>
          <ActivityTimeline events={[
            { time: ticket.lastUpdate, label: "Last updated", done: true },
            { time: "2024-06-04", label: "Agent assigned", done: true },
            { time: "2024-06-03", label: "Ticket created", done: true },
          ]} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
