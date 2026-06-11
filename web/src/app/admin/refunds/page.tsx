"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { MOCK_REFUNDS } from "@/lib/shared-entities";

export default function AdminRefundsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Refund Authorisation" subtitle="AF-15" />
      {MOCK_REFUNDS.map((r) => (
        <Link key={r.id} href={`/admin/refunds/${r.id}`} className="card-premium block p-4 transition-colors hover:border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{r.id}</p>
              <p className="text-sm text-slate-500">
                <Link href={`/admin/orders/${r.orderId}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{r.orderId}</Link>
                {" · "}{r.method} · {r.reason}
              </p>
              <DualCurrency amount={r.amount} className="mt-2 text-lg font-bold" />
            </div>
            <Badge variant="warning">{r.status}</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
