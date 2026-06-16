"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { getOrder } from "@/lib/entities";
import { useLocale } from "@/context/locale-context";

export default function OrderConfirmedPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const order = getOrder(id);

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: "En attente",
      processing: "En cours",
      shipped: "Expédié",
      delivered: "Livré",
      cancelled: "Annulé",
    };
    return fr ? (map[status] ?? status) : status;
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
      <PageHeader title={fr ? "Commande confirmée !" : "Order Confirmed!"} subtitle={id} />
      <DetailSection title={fr ? "Résumé" : "Summary"}>
        <InfoGrid items={[
          { label: fr ? "N° de commande" : "Order ID", value: id },
          { label: fr ? "Statut" : "Status", value: statusLabel(order?.status ?? "processing") },
          { label: fr ? "Total" : "Total", value: <DualCurrency amount={order?.amount ?? 1498} className="font-bold" /> },
          { label: fr ? "Livraison estimée" : "Est. delivery", value: fr ? "1-3 jours" : "1-3 days" },
        ]} />
      </DetailSection>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={`/shop/orders/${id}`} className="btn-primary px-6 py-3">{fr ? "Voir la commande" : "View Order"}</Link>
        <Link href={`/shop/orders/${id}/tracking`} className="rounded-xl border px-6 py-3 text-sm font-medium">{fr ? "Suivre" : "Track"}</Link>
      </div>
    </div>
  );
}
