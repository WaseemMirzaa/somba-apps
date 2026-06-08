"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";

const PENDING_REFUNDS = [
  { id: "REF-001", orderId: "ORD-2024-001", amount: 1199, method: "stripe", reason: "Return approved" },
  { id: "REF-002", orderId: "ORD-2024-003", amount: 129, method: "manual", reason: "COD refund via Airtel" },
];

export default function AdminRefundsPage() {
  const { toast } = useToast();
  const [approved, setApproved] = useState<string[]>([]);

  return (
    <div className="space-y-6">
      <PageHeader title="Refund Authorisation" subtitle="AF-15" />
      {PENDING_REFUNDS.map((r) => (
        <DetailSection key={r.id} title={r.id}>
          <p className="text-sm">{r.orderId} · {r.method} · {r.reason}</p>
          <DualCurrency amount={r.amount} className="mt-2 text-lg font-bold" />
          {approved.includes(r.id) ? (
            <span className="mt-2 text-sm text-emerald-600">Approved</span>
          ) : (
            <Button onClick={() => { setApproved((a) => [...a, r.id]); toast(`Refund ${r.id} authorised`); }} className="mt-3">
              Authorise Refund
            </Button>
          )}
        </DetailSection>
      ))}
    </div>
  );
}
