"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { MOCK_ADMIN_PAYOUTS } from "@/lib/shared-entities";

export default function AdminPayoutsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Payout Approval" subtitle="Δ4 — weekly, $10 min, 48h clearance" />
      {MOCK_ADMIN_PAYOUTS.map((p) => (
        <Link key={p.id} href={`/admin/payouts/${p.id}`} className="card-premium block p-4 transition-colors hover:border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                <Link href={`/admin/sellers/${p.sellerId}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{p.seller}</Link>
              </p>
              <DualCurrency amount={p.amount} />
              <p className="text-xs text-slate-500">{p.requestedAt}</p>
            </div>
            <Badge variant="warning">{p.status}</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
