"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getShiftReconciliation } from "@/lib/warehouse-entities";
import { useToast } from "@/context/toast-context";

export default function WarehouseReconciliationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const shift = getShiftReconciliation(id);
  const [received, setReceived] = useState(String(shift?.received ?? ""));

  if (!shift) return <div className="p-8 text-center text-slate-500">Shift not found</div>;

  const variance = Number(received) - shift.expected;

  return (
    <div className="space-y-6">
      <PageHeader title={shift.id} subtitle={`${shift.date} · ${shift.rider}`} backHref="/warehouse/reconciliation" actions={<Badge variant={shift.status === "reconciled" ? "success" : "warning"}>{shift.status}</Badge>} />
      <DetailSection title="Shift Reconciliation">
        <InfoGrid items={[
          { label: "Rider", value: <Link href={`/warehouse/riders/${shift.riderId}`} className="text-indigo-600 hover:underline">{shift.rider}</Link> },
          { label: "COD Record", value: <Link href={`/warehouse/cod/${shift.codId}`} className="text-indigo-600 hover:underline">{shift.codId}</Link> },
          { label: "Expected", value: <DualCurrency amount={shift.expected} /> },
          { label: "Received", value: <DualCurrency amount={shift.received} /> },
          { label: "Variance", value: variance === 0 ? "✓ Match" : <DualCurrency amount={Math.abs(variance)} /> },
        ]} />
        {shift.status !== "reconciled" && (
          <>
            <input className="input-premium mt-4 w-full px-4 py-2 text-sm" placeholder="Amount received" value={received} onChange={(e) => setReceived(e.target.value)} />
            <Button onClick={() => toast("Shift reconciled")} className="mt-4 w-full">Reconcile Shift</Button>
          </>
        )}
      </DetailSection>
    </div>
  );
}
