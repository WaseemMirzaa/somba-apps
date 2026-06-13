"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getExchange } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseExchangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const exc = getExchange(id);
  const [status, setStatus] = useState(exc?.status ?? "pending");
  const [allocated, setAllocated] = useState(false);

  if (!exc) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Échange introuvable" : "Exchange not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={exc.id}
        subtitle={`Order ${exc.orderId} · ${status}`}
        backHref="/warehouse/exchanges"
        actions={
          status === "approved" ? (
            <Badge variant="success">{fr ? "Approuvé" : "Approved"}</Badge>
          ) : (
            <>
              <button onClick={() => { setStatus("approved"); toast(fr ? "Échange approuvé" : "Exchange approved"); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">{fr ? "Approuver l'échange" : "Approve Exchange"}</button>
              <button onClick={() => { setAllocated(true); toast(fr ? "Variante allouée depuis l'inventaire" : "Variant allocated from inventory", "info"); }} disabled={allocated} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{allocated ? (fr ? "Variante allouée ✓" : "Variant Allocated ✓") : (fr ? "Allouer la variante" : "Allocate Variant")}</button>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Exchange Details">
          <InfoGrid items={[
            { label: "Exchange ID", value: exc.id },
            { label: "Order", value: <Link href={`/admin/orders/${exc.orderId}`} className="text-indigo-600 hover:underline">{exc.orderId}</Link> },
            { label: "Customer", value: exc.customer },
            { label: "Old SKU", value: exc.oldSku },
            { label: "New SKU", value: exc.newSku },
            { label: "Price Difference", value: exc.priceDifference > 0 ? `Collect ${formatCurrency(exc.priceDifference, locale)}` : exc.priceDifference < 0 ? `Refund ${formatCurrency(Math.abs(exc.priceDifference), locale)}` : "No difference" },
          ]} />
        </DetailSection>

        <DetailSection title={fr ? "Flux de travail" : "Workflow"}>
          <p className="text-sm text-slate-600">{fr ? "Ancien produit retourné → Inspection → Allouer la nouvelle variante → Expédier" : "Old product returned → Inspection → Allocate new variant → Dispatch"}</p>
          <p className="mt-2 text-sm">
            <span className="text-slate-500">{fr ? "Variante allouée :" : "Variant allocated:"}</span>{" "}
            <span className={allocated ? "font-medium text-emerald-600" : "text-slate-400"}>{allocated ? (fr ? "Oui" : "Yes") : (fr ? "En attente" : "Pending")}</span>
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/warehouse/inventory" className="text-sm text-indigo-600 hover:underline">{fr ? "Vérifier l'inventaire" : "Check Inventory"}</Link>
            <Link href="/warehouse/dispatch" className="text-sm text-indigo-600 hover:underline">{fr ? "Créer une expédition" : "Create Dispatch"}</Link>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
