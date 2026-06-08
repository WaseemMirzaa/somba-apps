"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";

export default function SellerDisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getDispute, addMessage } = useDisputes();
  const { locale } = useLocale();
  const [reply, setReply] = useState("");
  const dispute = getDispute(id);
  const fr = locale === "fr";

  if (!dispute) return <div className="text-center text-slate-500">Not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={dispute.id} subtitle={dispute.orderId} backHref="/seller/disputes" />
      <DetailSection title={fr ? "Messages" : "Messages"}>
        {dispute.messages.map((m, i) => (
          <div key={i} className="mb-2 rounded-lg bg-slate-50 p-3 text-sm"><strong>{m.from}:</strong> {m.text}</div>
        ))}
        <textarea className="input-premium mt-4 w-full px-3 py-2 text-sm" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={fr ? "Votre réponse" : "Your response"} />
        <Button onClick={() => { addMessage(id, "seller", reply); setReply(""); }} className="mt-2">{fr ? "Répondre" : "Respond"}</Button>
      </DetailSection>
    </div>
  );
}
