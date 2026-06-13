"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const PENDING_REFUNDS = [
  { id: "REF-001", orderId: "ORD-2024-001", amount: 1199, method: "stripe", reason: "Return approved" },
  { id: "REF-002", orderId: "ORD-2024-003", amount: 129, method: "airtel_money", reason: "Airtel Money refund" },
];

export default function AdminRefundsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [approved, setApproved] = useState<string[]>([]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Autorisation de remboursement" : "Refund Authorisation"}
        subtitle={fr ? "Remboursements en attente d'autorisation" : "Pending refunds awaiting authorisation"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Remboursements" : "Refunds" }]}
      />
      {PENDING_REFUNDS.map((r) => (
        <DetailSection key={r.id} title={r.id}>
          <p className="text-sm">{r.orderId} · {r.method} · {r.reason}</p>
          <DualCurrency amount={r.amount} className="mt-2 text-lg font-bold" />
          {approved.includes(r.id) ? (
            <span className="mt-2 text-sm text-emerald-600">{fr ? "Autorisé ✓" : "Approved ✓"}</span>
          ) : (
            <Button onClick={() => { setApproved((a) => [...a, r.id]); toast(fr ? `Remboursement ${r.id} autorisé` : `Refund ${r.id} authorised`); }} className="mt-3">
              {fr ? "Autoriser le remboursement" : "Authorise Refund"}
            </Button>
          )}
        </DetailSection>
      ))}
    </div>
  );
}
