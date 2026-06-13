"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function AdminDisputeResolutionPage() {
  const { id } = useParams<{ id: string }>();
  const { getDispute, resolveDispute } = useDisputes();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const dispute = getDispute(id);
  const [outcome, setOutcome] = useState<string | null>(null);

  if (!dispute) return <div className="p-8 text-center text-slate-500">{fr ? "Litige introuvable" : "Not found"}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Résolution du litige" : "Dispute Resolution"} subtitle={dispute.id} backHref="/admin/disputes" />
      <DetailSection title={fr ? "Dossier" : "Case"}>
        <p className="text-sm">{dispute.description}</p>
        {dispute.messages.map((m, i) => (
          <p key={i} className="mt-2 text-sm text-slate-600"><strong>{m.from}:</strong> {m.text}</p>
        ))}
        <div className="mt-4 flex items-center gap-2">
          {outcome ? (
            <Badge variant="success">{outcome === "buyer" ? (fr ? "Résolu — en faveur de l'acheteur" : "Resolved — favor buyer") : (fr ? "Résolu — en faveur du vendeur" : "Resolved — favor seller")}</Badge>
          ) : (
            <>
              <Button onClick={() => { resolveDispute(id); setOutcome("buyer"); toast(fr ? "Litige résolu — en faveur de l'acheteur" : "Dispute resolved — favor buyer"); }}>{fr ? "Résoudre — Acheteur" : "Resolve — Favor Buyer"}</Button>
              <Button variant="secondary" onClick={() => { resolveDispute(id); setOutcome("seller"); toast(fr ? "Litige résolu — en faveur du vendeur" : "Dispute resolved — favor seller"); }}>{fr ? "En faveur du vendeur" : "Favor Seller"}</Button>
            </>
          )}
        </div>
      </DetailSection>
    </div>
  );
}
