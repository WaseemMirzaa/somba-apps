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

export default function SellerSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { getTicket, addMessage } = useSupport();
  const ticket = getTicket(id);
  const [reply, setReply] = useState("");

  if (!ticket) {
    return <div className="p-8 text-center text-slate-500">Ticket not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.id}
        subtitle={ticket.subject}
        backHref="/seller/support"
        actions={<Badge variant={ticket.status === "resolved" ? "success" : "warning"}>{ticket.status}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title="Conversation" span={2}>
          <div className="space-y-3">
            {ticket.messages.map((m, i) => (
              <div key={i} className={`rounded-lg p-4 text-sm ${m.role === "seller" ? "bg-sky-50" : "bg-emerald-50"}`}>
                <p className="text-xs font-medium uppercase text-slate-400">{m.author}</p>
                <p className="mt-1">{m.text}</p>
              </div>
            ))}
          </div>
          {ticket.status !== "resolved" && (
            <>
              <textarea className="mt-4 w-full rounded-lg border border-sky-200 p-3 text-sm" placeholder="Reply..." rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button onClick={() => { if (!reply.trim()) return; addMessage(id, "seller", "TechZone Store", reply); setReply(""); toast("Reply sent"); }} className="mt-2">Send Reply</Button>
            </>
          )}
        </DetailGridSection>

        <DetailGridSection title="Details">
          <p className="text-sm"><strong>Priority:</strong> {ticket.priority}</p>
          <p className="mt-2 text-sm"><strong>Last update:</strong> {ticket.lastUpdate}</p>
          {ticket.orderId && (
            <Link href={`/seller/orders/${ticket.orderId}`} className="mt-4 inline-block text-sm text-sky-600 hover:underline">View order →</Link>
          )}
        </DetailGridSection>

        <DetailGridSection title="Timeline" span={3}>
          <ActivityTimeline events={[
            { time: ticket.createdAt, label: "Ticket created", done: true },
            { time: ticket.lastUpdate, label: "Last updated", done: true },
          ]} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
