"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";

export default function SellerDisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getDispute, addMessage } = useDisputes();
  const { t } = useLocale();
  const [reply, setReply] = useState("");
  const dispute = getDispute(id);

  if (!dispute) return <div className="text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={dispute.id} subtitle={dispute.orderId} backHref="/seller/disputes" />
      <DetailSection title={t("details")}>
        <InfoGrid items={[
          { label: t("order"), value: <Link href={`/seller/orders/${dispute.orderId}`} className="text-sky-600 hover:underline">{dispute.orderId}</Link> },
          { label: t("customer"), value: dispute.buyerName },
          { label: t("reason"), value: dispute.reason },
        ]} />
        <p className="mt-2 text-sm text-slate-600">{dispute.description}</p>
      </DetailSection>
      <DetailSection title={t("messages")}>
        {dispute.messages.map((m, i) => (
          <div key={i} className="mb-2 rounded-lg bg-slate-50 p-3 text-sm"><strong>{m.from}:</strong> {m.text}</div>
        ))}
        <textarea className="input-premium mt-4 w-full px-3 py-2 text-sm" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("yourResponse")} />
        <Button onClick={() => { if (!reply.trim()) return; addMessage(id, "seller", reply); setReply(""); }} className="mt-2">{t("respond")}</Button>
      </DetailSection>
    </div>
  );
}
