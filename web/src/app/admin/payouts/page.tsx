"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";

const PAYOUTS = [
  { id: "PAY-001", seller: "TechZone Store", amount: 2450, status: "requested" },
  { id: "PAY-002", seller: "AudioHub", amount: 890, status: "requested" },
];

export default function AdminPayoutsPage() {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <PageHeader title="Payout Approval" subtitle="Δ4 — weekly, $10 min, 48h clearance" />
      {PAYOUTS.map((p) => (
        <div key={p.id} className="card-premium flex items-center justify-between p-4">
          <div>
            <p className="font-medium">{p.seller}</p>
            <DualCurrency amount={p.amount} />
            <p className="text-xs text-slate-500">{statuses[p.id] ?? p.status}</p>
          </div>
          {!statuses[p.id] && (
            <div className="flex gap-2">
              <Button onClick={() => { setStatuses((s) => ({ ...s, [p.id]: "approved" })); toast("Payout approved"); }}>Approve</Button>
              <Button variant="secondary" onClick={() => { setStatuses((s) => ({ ...s, [p.id]: "rejected" })); toast("Rejected"); }}>Reject</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
