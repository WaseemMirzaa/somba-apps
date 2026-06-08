"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { codEntities } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";

export default function WarehouseCodPage() {
  const { t, locale } = useLocale();

  return (
    <WarehouseListPage
      title={t("cod")}
      subtitle="List View — Rider, Expected, Collected, Difference, Status"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("cod") }]}
      columns={[
        { key: "rider", label: "Rider", render: (row) => (
          <Link href={`/warehouse/riders/${row.riderId}`} className="font-medium text-indigo-600 hover:underline">{String(row.rider)}</Link>
        )},
        { key: "shift", label: "Shift" },
        { key: "expected", label: "Expected", render: (row) => formatCurrency(row.expected as number, locale) },
        { key: "collected", label: "Collected", render: (row) => formatCurrency(row.collected as number, locale) },
        { key: "difference", label: "Difference", render: (row) => {
          const diff = row.difference as number;
          return <span className={diff !== 0 ? "font-medium text-red-600" : "text-emerald-600"}>{formatCurrency(diff, locale)}</span>;
        }},
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "approved" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/warehouse/cod/${row.id}`} className="text-indigo-600 hover:underline">{t("view")}</Link>
            {row.status === "investigating" && (
              <Link href={`/warehouse/cod/${row.id}`} className="text-amber-600 hover:underline">Investigate</Link>
            )}
          </div>
        )},
      ]}
      data={codEntities as unknown as Record<string, unknown>[]}
    />
  );
}
