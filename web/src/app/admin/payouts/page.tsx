"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const PAYOUTS = [
  { id: "PAY-001", seller: "TechZone Store", amount: 2450, status: "requested" },
  { id: "PAY-002", seller: "AudioHub", amount: 890, status: "requested" },
];

export default function AdminPayoutsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Approbation des paiements" : "Payout Approval"}
        subtitle={fr ? "Hebdomadaire · minimum 10 $ · délai 48h" : "Weekly · $10 minimum · 48h clearance"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Paiements" : "Payouts" }]}
      />
      {PAYOUTS.map((p) => (
        <div key={p.id} className="card-premium flex items-center justify-between p-4">
          <div>
            <p className="font-medium">{p.seller}</p>
            <DualCurrency amount={p.amount} />
            <p className="text-xs text-slate-500">{statuses[p.id] ?? (fr ? "demandé" : p.status)}</p>
          </div>
          {!statuses[p.id] && (
            <div className="flex gap-2">
              <Button onClick={() => { setStatuses((s) => ({ ...s, [p.id]: fr ? "approuvé" : "approved" })); toast(fr ? "Paiement approuvé" : "Payout approved"); }}>{fr ? "Approuver" : "Approve"}</Button>
              <Button variant="secondary" onClick={() => { setStatuses((s) => ({ ...s, [p.id]: fr ? "rejeté" : "rejected" })); toast(fr ? "Rejeté" : "Rejected"); }}>{fr ? "Rejeter" : "Reject"}</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
