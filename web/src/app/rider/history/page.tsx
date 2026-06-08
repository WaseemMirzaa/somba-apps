"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { riderTasks } from "@/lib/rider-entities";

export default function RiderHistoryPage() {
  const completed = riderTasks.filter((t) => t.status === "delivered");

  return (
    <div className="space-y-6">
      <PageHeader title="Task History" subtitle={`${completed.length} completed`} />
      {completed.map((t) => (
        <Link key={t.id} href={`/rider/tasks/${t.id}`} className="block rounded-xl border p-4">
          <div className="flex justify-between font-medium">{t.id} <span className="text-emerald-600">delivered</span></div>
          <p className="text-sm text-slate-500">{t.customer} · {t.orderId}</p>
        </Link>
      ))}
    </div>
  );
}
