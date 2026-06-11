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
import { getRefund } from "@/lib/shared-entities";
import { useToast } from "@/context/toast-context";

export default function AdminRefundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const refund = getRefund(id);
  const [status, setStatus] = useState(refund?.status ?? "pending");

  if (!refund) return <div className="p-8 text-center text-slate-500">Refund not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={refund.id}
        subtitle="Refund Authorisation — AF-15"
        backHref="/admin/refunds"
        actions={<Badge variant={status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"}>{status}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title="Refund">
          <InfoGrid items={[
            { label: "Order", value: <Link href={`/admin/orders/${refund.orderId}`} className="text-blue-600 hover:underline">{refund.orderId}</Link> },
            { label: "Customer", value: refund.customerName ?? "—" },
            { label: "Method", value: refund.method },
            { label: "Reason", value: refund.reason, full: true },
            { label: "Amount", value: <DualCurrency amount={refund.amount} /> },
          ]} />
          {status === "pending" && (
            <div className="mt-4 flex gap-2">
              <Button onClick={() => { setStatus("approved"); toast(`Refund ${refund.id} authorised`); }}>Authorise Refund</Button>
              <Button variant="secondary" onClick={() => { setStatus("rejected"); toast("Refund rejected"); }}>Reject</Button>
            </div>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
