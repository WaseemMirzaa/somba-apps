"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { useDisputes } from "@/context/dispute-context";
import { useToast } from "@/context/toast-context";

export default function AdminDisputeResolutionPage() {
  const { id } = useParams<{ id: string }>();
  const { getDispute, resolveDispute } = useDisputes();
  const { toast } = useToast();
  const dispute = getDispute(id);

  if (!dispute) return <div>Not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Dispute Resolution" subtitle={dispute.id} backHref="/admin/disputes" />
      <DetailSection title="Case">
        <p className="text-sm">{dispute.description}</p>
        {dispute.messages.map((m, i) => (
          <p key={i} className="mt-2 text-sm text-slate-600"><strong>{m.from}:</strong> {m.text}</p>
        ))}
        <div className="mt-4 flex gap-2">
          <Button onClick={() => { resolveDispute(id); toast("Dispute resolved"); }}>Resolve — Favor Buyer</Button>
          <Button variant="secondary" onClick={() => toast("Resolved — favor seller")}>Favor Seller</Button>
        </div>
      </DetailSection>
    </div>
  );
}
