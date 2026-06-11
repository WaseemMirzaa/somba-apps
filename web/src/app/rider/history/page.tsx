"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { riderTasks } from "@/lib/rider-entities";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";

export default function RiderHistoryPage() {
  const { locale, t } = useLocale();
  const completed = riderTasks.filter((task) => task.status === "delivered");

  return (
    <div className="space-y-6">
      <PageHeader title={t("taskHistory")} subtitle={`${completed.length} ${t("completedTasks")}`} />
      {completed.map((task) => (
        <Link key={task.id} href={`/rider/tasks/${task.id}`} className="block rounded-xl border p-4">
          <div className="flex justify-between font-medium">{task.id} <span className="text-emerald-600">{statusLabel(locale, task.status)}</span></div>
          <p className="text-sm text-slate-500">{task.customer} · {task.orderId}</p>
        </Link>
      ))}
    </div>
  );
}
