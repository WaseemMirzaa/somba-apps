"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getShiftReconciliation } from "@/lib/warehouse-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { L, statusLabel } from "@/lib/locale-helpers";

export default function WarehouseReconciliationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const shift = getShiftReconciliation(id);
  const [received, setReceived] = useState(String(shift?.received ?? ""));

  if (!shift) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  const variance = Number(received) - shift.expected;

  return (
    <div className="space-y-6">
      <PageHeader title={shift.id} subtitle={`${shift.date} · ${shift.rider}`} backHref="/warehouse/reconciliation" actions={<Badge variant={shift.status === "reconciled" ? "success" : "warning"}>{statusLabel(locale, shift.status)}</Badge>} />
      <DetailSection title={t("shiftReconciliation")}>
        <InfoGrid items={[
          { label: t("rider"), value: <Link href={`/warehouse/riders/${shift.riderId}`} className="text-indigo-600 hover:underline">{shift.rider}</Link> },
          { label: L(locale, "COD Record", "Enregistrement COD"), value: <Link href={`/warehouse/cod/${shift.codId}`} className="text-indigo-600 hover:underline">{shift.codId}</Link> },
          { label: t("expected"), value: <DualCurrency amount={shift.expected} /> },
          { label: t("received"), value: <DualCurrency amount={shift.received} /> },
          { label: t("variance"), value: variance === 0 ? L(locale, "✓ Match", "✓ Correspondance") : <DualCurrency amount={Math.abs(variance)} /> },
        ]} />
        {shift.status !== "reconciled" && (
          <>
            <input className="input-premium mt-4 w-full px-4 py-2 text-sm" placeholder={L(locale, "Amount received", "Montant reçu")} value={received} onChange={(e) => setReceived(e.target.value)} />
            <Button onClick={() => toast(L(locale, "Shift reconciled", "Shift réconciliée"))} className="mt-4 w-full">{t("submitReconciliation")}</Button>
          </>
        )}
      </DetailSection>
    </div>
  );
}
