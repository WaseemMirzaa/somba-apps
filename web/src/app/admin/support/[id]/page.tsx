"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { statusLabel, severityLabel } from "@/lib/locale-helpers";
import { useSupport } from "@/context/support-context";
import { useToast } from "@/context/toast-context";

export default function AdminSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { getTicket, addMessage, updateStatus } = useSupport();
  const { toast } = useToast();
  const ticket = getTicket(id);
  const [reply, setReply] = useState("");

  if (!ticket) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.id}
        subtitle={ticket.subject}
        backHref="/admin/support"
        actions={<Badge variant={ticket.status === "resolved" ? "success" : ticket.priority === "high" ? "danger" : "info"}>{statusLabel(locale, ticket.status)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={t("supportDetail")}>
          <InfoGrid items={[
            { label: t("customer"), value: ticket.customer },
            { label: t("severity"), value: severityLabel(locale, ticket.priority) },
            { label: t("portals"), value: ticket.portal },
            { label: t("date"), value: ticket.createdAt },
            ...(ticket.orderId ? [{ label: t("order"), value: <Link href={`/admin/orders/${ticket.orderId}`} className="text-blue-600 hover:underline">{ticket.orderId}</Link> }] : []),
            ...(ticket.sellerName ? [{ label: t("seller"), value: ticket.sellerName }] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("supportTicket")} span={2}>
          <div className="space-y-3">
            {ticket.messages.map((m, i) => (
              <div key={i} className={`rounded-lg p-4 text-sm ${m.role === "agent" ? "bg-emerald-50" : "bg-slate-50"}`}>
                <p className="text-xs font-medium uppercase text-slate-400">{m.author} · {m.role}</p>
                <p className="mt-1">{m.text}</p>
              </div>
            ))}
          </div>
          <textarea className="input-premium mt-4 w-full px-4 py-2 text-sm" rows={3} placeholder={t("notes")} value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => { if (!reply.trim()) return; addMessage(id, "agent", "Support Agent", reply); setReply(""); toast(t("submit")); }}>{t("submit")}</Button>
            <Button variant="secondary" onClick={() => { updateStatus(id, "resolved"); toast(t("resolved")); }}>{t("resolved")}</Button>
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
