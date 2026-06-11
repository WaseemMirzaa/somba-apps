"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
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
        <InfoGrid items={[
          { label: "Order", value: <Link href={`/admin/orders/${dispute.orderId}`} className="text-blue-600 hover:underline">{dispute.orderId}</Link> },
          { label: "Buyer", value: dispute.buyerName },
          { label: "Seller", value: <Link href={`/admin/sellers/${dispute.sellerId}`} className="text-blue-600 hover:underline">{dispute.sellerName}</Link> },
          { label: "Reason", value: dispute.reason },
        ]} />
        <p className="mt-4 text-sm">{dispute.description}</p>
        {dispute.messages.map((m, i) => (
          <p key={i} className="mt-2 text-sm text-slate-600"><strong>{m.from}:</strong> {m.text}</p>
        ))}
        <div className="mt-4 flex gap-2">
          <Button onClick={() => { resolveDispute(id); toast("Dispute resolved — favor buyer"); }}>Resolve — Favor Buyer</Button>
          <Button variant="secondary" onClick={() => toast("Resolved — favor seller")}>Favor Seller</Button>
          <Link href={`/admin/refunds`} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Authorise Refund →</Link>
        </div>
      </DetailSection>
    </div>
  );
}
