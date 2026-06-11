"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { warehouseParcels } from "@/lib/mock-data";

const AGED = warehouseParcels.filter((p) => p.status === "inbound" || p.priority === "low");

export default function WarehouseAgedPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Aged / Stuck Parcels" subtitle={`${AGED.length} parcels need attention`} />
      {AGED.map((p) => (
        <Link key={p.id} href={`/warehouse/parcels/${p.id}`} className="block rounded-xl border border-amber-200 bg-amber-50/50 p-4 hover:border-amber-300">
          <div className="flex justify-between font-medium">{p.id} <span className="text-amber-700">{p.status}</span></div>
          <p className="text-sm text-slate-500">{p.orderId} · {p.seller} · {p.zone} · arrived {p.arrival}</p>
        </Link>
      ))}
    </div>
  );
}
