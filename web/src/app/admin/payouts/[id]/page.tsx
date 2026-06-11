"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminPayout } from "@/lib/shared-entities";
import { useToast } from "@/context/toast-context";

export default function AdminPayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const payout = getAdminPayout(id);
  const [status, setStatus] = useState(payout?.status ?? "requested");

  if (!payout) return <div className="p-8 text-center text-slate-500">Payout not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={payout.id}
        subtitle="Payout Approval — AF-16"
        backHref="/admin/payouts"
        actions={<Badge variant={status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"}>{status}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title="Payout Request">
          <InfoGrid items={[
            { label: "Seller", value: <Link href={`/admin/sellers/${payout.sellerId}`} className="text-blue-600 hover:underline">{payout.seller}</Link> },
            { label: "Amount", value: <DualCurrency amount={payout.amount} /> },
            { label: "Bank Account", value: payout.bankAccount ?? "—" },
            { label: "Requested", value: payout.requestedAt },
          ]} />
          {status === "requested" && (
            <div className="mt-4 flex gap-2">
              <Button onClick={() => { setStatus("approved"); toast("Payout approved"); }}>Approve</Button>
              <Button variant="secondary" onClick={() => { setStatus("rejected"); toast("Payout rejected"); }}>Reject</Button>
            </div>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
