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
  const order = getOrder(id);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
      <PageHeader title={locale === "fr" ? "Commande confirmée !" : "Order Confirmed!"} subtitle={id} />
      <DetailSection title={locale === "fr" ? "Résumé" : "Summary"}>
        <InfoGrid items={[
          { label: "Order ID", value: id },
          { label: locale === "fr" ? "Statut" : "Status", value: order?.status ?? "processing" },
          { label: locale === "fr" ? "Total" : "Total", value: <DualCurrency amount={order?.amount ?? 1498} className="font-bold" /> },
          { label: locale === "fr" ? "Livraison estimée" : "Est. delivery", value: "1-3 days" },
        ]} />
      </DetailSection>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={`/shop/orders/${id}`} className="btn-primary px-6 py-3">{locale === "fr" ? "Voir la commande" : "View Order"}</Link>
        <Link href={`/shop/orders/${id}/tracking`} className="rounded-xl border px-6 py-3 text-sm font-medium">{locale === "fr" ? "Suivre" : "Track"}</Link>
      </div>
    </div>
  );
}
