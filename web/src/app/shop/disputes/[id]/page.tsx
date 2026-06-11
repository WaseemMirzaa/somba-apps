"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";

export default function ShopDisputePage() {
  const { id } = useParams<{ id: string }>();
  const { getDispute, addMessage } = useDisputes();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const dispute = getDispute(id);
  const [reply, setReply] = useState("");

  if (!dispute) return <div className="text-center text-slate-500">Dispute not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={dispute.id} subtitle={`${dispute.orderId} · ${dispute.status}`} backHref="/shop/disputes" />
      <DetailSection title={fr ? "Détails" : "Details"}>
        <p className="text-sm">
          <strong>{fr ? "Commande" : "Order"}:</strong>{" "}
          <Link href={`/shop/orders/${dispute.orderId}`} className="text-blue-600 hover:underline">{dispute.orderId}</Link>
        </p>
        <p className="mt-2 text-sm"><strong>{fr ? "Vendeur" : "Seller"}:</strong> {dispute.sellerName}</p>
        <p className="mt-2 text-sm">{dispute.description}</p>
      </DetailSection>
      <DetailSection title={fr ? "Messages" : "Messages"}>
        <div className="space-y-3">
          {dispute.messages.map((m, i) => (
            <div key={i} className={`rounded-lg p-3 text-sm ${m.from === "buyer" ? "bg-blue-50" : "bg-slate-50"}`}>
              <p className="text-xs font-medium uppercase text-slate-400">{m.from}</p>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
        {dispute.status !== "resolved" && dispute.status !== "closed" && (
          <>
            <textarea
              className="input-premium mt-4 w-full px-4 py-2 text-sm"
              rows={3}
              placeholder={fr ? "Votre réponse..." : "Your reply..."}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <Button
              className="mt-2"
              onClick={() => {
                if (!reply.trim()) return;
                addMessage(id, "buyer", reply);
                setReply("");
              }}
            >
              {fr ? "Envoyer" : "Send Reply"}
            </Button>
          </>
        )}
      </DetailSection>
    </div>
  );
}
