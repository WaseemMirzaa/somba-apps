"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSupport } from "@/context/support-context";
import { useLocale } from "@/context/locale-context";
import { localizedField, statusLabel } from "@/lib/locale-helpers";

export default function ShopSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getTicket, addMessage } = useSupport();
  const { locale, t } = useLocale();
  const ticket = getTicket(id);
  const [reply, setReply] = useState("");

  if (!ticket) return <div className="text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.id}
        subtitle={localizedField(locale, ticket.subject, ticket.subjectFr)}
        backHref="/shop/support"
        actions={<Badge variant={ticket.status === "resolved" ? "success" : "info"}>{statusLabel(locale, ticket.status)}</Badge>}
      />

      <DetailSection title={t("details")}>
        {ticket.orderId && (
          <p className="text-sm">
            {t("order")}:{" "}
            <Link href={`/shop/orders/${ticket.orderId}`} className="text-blue-600 hover:underline">{ticket.orderId}</Link>
          </p>
        )}
        <p className="mt-2 text-sm text-slate-500">{t("priority")}: {ticket.priority}</p>
      </DetailSection>

      <DetailSection title={t("messages")}>
        <div className="space-y-3">
          {ticket.messages.map((m, i) => (
            <div key={i} className={`rounded-lg p-4 text-sm ${m.role === "customer" ? "bg-blue-50" : "bg-slate-50"}`}>
              <p className="text-xs font-medium uppercase text-slate-400">{m.author}</p>
              <p className="mt-1">{localizedField(locale, m.text, m.textFr)}</p>
            </div>
          ))}
        </div>
        {ticket.status !== "resolved" && (
          <>
            <textarea
              className="input-premium mt-4 w-full px-4 py-2 text-sm"
              rows={3}
              placeholder={t("yourMessagePlaceholder")}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <Button
              className="mt-2"
              onClick={() => {
                if (!reply.trim()) return;
                addMessage(id, "customer", "Marie Kabila", reply);
                setReply("");
              }}
            >
              {t("sendReply")}
            </Button>
          </>
        )}
      </DetailSection>
    </div>
  );
}
