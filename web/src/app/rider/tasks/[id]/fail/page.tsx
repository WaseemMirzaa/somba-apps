"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { FailedForm } from "@/components/warehouse/rider-task-actions";
import { useLocale } from "@/context/locale-context";
import { useRiderData } from "@/lib/rider";

export default function RiderFailedDeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const { getRiderTask, refresh, loading } = useRiderData();
  const task = getRiderTask(id);

  if (!task) return <div className="text-center text-slate-500">{loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Introuvable" : "Not found")}</div>;

  const canFail = task.status === "assigned" || task.status === "picked_up" || task.status === "in_transit";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title={fr ? "Impossible de terminer" : "Could not complete"} subtitle={task.orderId} backHref={`/rider/tasks/${id}`} />
      <div className="card-premium space-y-4 p-6">
        {canFail ? (
          <FailedForm
            task={task}
            onDone={() => {
              void refresh();
              router.push("/rider/tasks");
            }}
          />
        ) : (
          <p className="text-sm text-slate-600">
            {fr ? "Cette tâche est déjà terminée." : "This task is already finished."}{" "}
            <Link href={`/rider/tasks/${id}`} className="text-emerald-700 underline">
              {fr ? "Retour à la tâche" : "Back to the task"}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
