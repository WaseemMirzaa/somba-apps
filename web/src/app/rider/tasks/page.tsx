"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { riderTasks } from "@/lib/rider-entities";
import { cn } from "@/lib/utils";

export default function RiderTasksPage() {
  const { t } = useLocale();
  const [tab, setTab] = useState<"active" | "completed">("active");

  const activeTasks = riderTasks.filter((task) => task.status !== "delivered");
  const completedTasks = riderTasks.filter((task) => task.status === "delivered");
  const data = tab === "active" ? activeTasks : completedTasks;

  return (
    <div className="space-y-6">
      <PageHeader title={t("activeTasks")} />
      <Link href="/rider/batches/BATCH-002" className="card-premium block border-emerald-200 bg-emerald-50/50 p-4 hover:border-emerald-300">
        <p className="font-semibold text-emerald-800">{t("batchDetail")} BATCH-002 — 4 {t("stop").toLowerCase()}s</p>
        <p className="text-sm text-emerald-700">{t("view")} →</p>
      </Link>

      <div className="flex flex-wrap gap-2">
        {(["active", "completed"] as const).map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize",
              tab === tabId ? "bg-emerald-600 text-white" : "border border-emerald-200 text-slate-600 hover:bg-emerald-50"
            )}
          >
            {tabId === "active" ? "Active" : t("completedToday")}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: "Task",
                render: (row) => (
                  <Link href={`/rider/tasks/${row.id}`} className="font-medium text-emerald-600 hover:underline">
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "type",
                label: "Type",
                render: (row) => <Badge variant="primary">{String(row.type)}</Badge>,
              },
              { key: "customer", label: "Customer" },
              { key: "address", label: "Address" },
              { key: "distance", label: "Distance" },
              { key: "items", label: "Items" },
              { key: "eta", label: "ETA" },
              {
                key: "status",
                label: t("status"),
                render: (row) => <Badge>{String(row.status).replace("_", " ")}</Badge>,
              },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/rider/tasks/${row.id}`} className="text-xs font-medium text-emerald-600 hover:underline">
                    {t("view")}
                  </Link>
                ),
              },
            ]}
            data={data as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
