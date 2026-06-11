"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getRiderBatch, getRiderTask } from "@/lib/rider-entities";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";

export default function RiderBatchPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const batch = getRiderBatch(id);

  if (!batch) {
    return <div className="text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`${t("batchDetail")} ${batch.id}`} subtitle={`${batch.zone} · ${batch.stops.length} ${t("stop").toLowerCase()}s`} backHref="/rider/tasks" />
      <ol className="space-y-2">
        {batch.stops.map((s) => {
          const task = getRiderTask(s.taskId);
          return (
            <li key={s.seq} className={`rounded-xl border p-4 ${s.status === "current" ? "border-emerald-300 bg-emerald-50" : ""}`}>
              <div className="flex justify-between">
                <span className="font-medium">#{s.seq} {s.address}</span>
                <span className="text-xs text-slate-500">{statusLabel(locale, s.status)}</span>
              </div>
              {task && (
                <p className="mt-1 text-xs text-slate-500">{task.orderId} · {task.customer}</p>
              )}
              <Link href={`/rider/tasks/${s.taskId}`} className="text-sm text-emerald-600 hover:underline">{fr ? "Ouvrir tâche →" : "Open task →"}</Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
