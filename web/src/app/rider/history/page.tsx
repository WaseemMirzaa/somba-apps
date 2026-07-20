"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import { useRiderData } from "@/lib/rider";

export default function RiderHistoryPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { riderTasks } = useRiderData();
  const completed = riderTasks.filter((t) => t.status === "delivered");

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Historique des tâches" : "Task History"} subtitle={`${completed.length} ${fr ? "terminées" : "completed"}`} />
      {completed.map((t) => (
        <Link key={t.id} href={`/rider/tasks/${t.id}`} className="block rounded-xl border p-4">
          <div className="flex justify-between font-medium">{t.id} <span className="text-emerald-600">{fr ? "livré" : "delivered"}</span></div>
          <p className="text-sm text-slate-500">{t.customer} · {t.orderId}</p>
        </Link>
      ))}
    </div>
  );
}
