"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getRiderTask } from "@/lib/rider-entities";

const STOPS = [
  { seq: 1, taskId: "TSK-101", address: "8 Rue de la Paix", status: "completed" },
  { seq: 2, taskId: "TSK-102", address: "45 Champs-Élysées", status: "current" },
  { seq: 3, taskId: "TSK-103", address: "12 Gombe Commerce", status: "pending" },
];

export default function RiderBatchPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <PageHeader title={`Batch ${id}`} subtitle="Stop sequence" backHref="/rider/tasks" />
      <ol className="space-y-2">
        {STOPS.map((s) => (
          <li key={s.seq} className={`rounded-xl border p-4 ${s.status === "current" ? "border-emerald-300 bg-emerald-50" : ""}`}>
            <div className="flex justify-between">
              <span className="font-medium">#{s.seq} {s.address}</span>
              <span className="text-xs text-slate-500">{s.status}</span>
            </div>
            <Link href={`/rider/tasks/${s.taskId}`} className="text-sm text-emerald-600 hover:underline">Open task →</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
