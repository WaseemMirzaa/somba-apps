"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useDisputes } from "@/context/dispute-context";

export default function AdminDisputesPage() {
  const { disputes } = useDisputes();

  return (
    <div className="space-y-6">
      <PageHeader title="Disputes Queue" subtitle={`${disputes.length} open cases`} />
      {disputes.map((d) => (
        <Link key={d.id} href={`/admin/disputes/${d.id}`} className="block rounded-xl border p-4 hover:border-blue-200">
          <div className="flex justify-between font-medium">{d.id} <span className="text-xs text-slate-500">{d.status}</span></div>
          <p className="text-sm text-slate-500">{d.buyerName} vs {d.sellerName} · {d.orderId}</p>
        </Link>
      ))}
    </div>
  );
}
