"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

const COD_ORDERS = [
  { id: "ORD-2024-001", customer: "Marie D.", amount: 1498 },
  { id: "ORD-2024-006", customer: "Jean K.", amount: 349 },
];

export default function RiderCodSummaryPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const total = COD_ORDERS.reduce((s, o) => s + o.amount, 0);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={locale === "fr" ? "Résumé COD — fin de shift" : "COD Shift Summary"} subtitle="2026-06-08" backHref="/rider" />

      <DetailSection title={locale === "fr" ? "Collecte du jour" : "Today's Collection"}>
        <InfoGrid items={[
          { label: locale === "fr" ? "Commandes COD" : "COD Orders", value: String(COD_ORDERS.length) },
          { label: locale === "fr" ? "Total espèces" : "Total Cash", value: <DualCurrency amount={total} className="font-bold text-emerald-700" /> },
          { label: locale === "fr" ? "Statut remise" : "Remittance Status", value: locale === "fr" ? "En attente" : "Pending handover" },
        ]} />
        <ul className="mt-4 space-y-2">
          {COD_ORDERS.map((o) => (
            <li key={o.id} className="flex justify-between rounded-lg border p-3 text-sm">
              <span>{o.id} · {o.customer}</span>
              <DualCurrency amount={o.amount} />
            </li>
          ))}
        </ul>
        <Button onClick={() => toast(locale === "fr" ? "Remise confirmée à l'entrepôt" : "Handover confirmed at warehouse")} className="mt-4 w-full">
          {locale === "fr" ? "Confirmer remise entrepôt" : "Confirm Warehouse Handover"}
        </Button>
        <Link href="/warehouse/cod" className="mt-2 block text-center text-sm text-blue-600 hover:underline">
          {locale === "fr" ? "Voir réconciliation entrepôt →" : "View warehouse reconciliation →"}
        </Link>
      </DetailSection>
    </div>
  );
}
