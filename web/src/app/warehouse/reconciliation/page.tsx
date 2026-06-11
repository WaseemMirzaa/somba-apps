"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { shiftReconciliationEntities } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";

export default function WarehouseReconciliationPage() {
  const { t, locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader title={t("shiftReconciliation")} subtitle={t("shiftReconciliationSubtitle")} />
      <div className="space-y-3">
        {shiftReconciliationEntities.map((shift) => (
          <Link key={shift.id} href={`/warehouse/reconciliation/${shift.id}`} className="card-premium block p-5 hover:border-indigo-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{shift.id} · {shift.rider}</p>
                <p className="text-sm text-slate-500">{shift.date} · {shift.codId}</p>
                <DualCurrency amount={shift.expected} className="mt-1 text-sm" />
              </div>
              <Badge variant={shift.status === "reconciled" ? "success" : "warning"}>{statusLabel(locale, shift.status)}</Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
