"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";

export default function WarehouseReconciliationPage() {
  const { toast } = useToast();
  const [received, setReceived] = useState("1847");
  const expected = 1847;
  const variance = Number(received) - expected;

  return (
    <div className="space-y-6">
      <PageHeader title="Shift Reconciliation" subtitle="WF-12" />
      <DetailSection title="End of Shift">
        <InfoGrid items={[
          { label: "Shift Date", value: "2026-06-08" },
          { label: "Rider", value: "Jean M." },
          { label: "Expected COD", value: <DualCurrency amount={expected} /> },
          { label: "Variance", value: variance === 0 ? "✓ Match" : <DualCurrency amount={Math.abs(variance)} /> },
        ]} />
        <input className="input-premium mt-4 w-full px-4 py-2 text-sm" placeholder="Amount received" value={received} onChange={(e) => setReceived(e.target.value)} />
        <Button onClick={() => toast("Shift reconciled")} className="mt-4 w-full">Reconcile Shift</Button>
      </DetailSection>
    </div>
  );
}
