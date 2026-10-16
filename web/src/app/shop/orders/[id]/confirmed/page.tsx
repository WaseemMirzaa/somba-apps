"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { PageLoader } from "@/components/ui/loader";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyOrder } from "@/lib/orders";
import { useLocale } from "@/context/locale-context";

const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  processing: "En préparation",
  shipped: "Expédiée",
  out_for_delivery: "En cours de livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
  returned: "Retournée",
};

function ConfirmedContent() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const order = useMyOrder(id);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!order) {
    if (!waited) return <PageLoader className="py-16" />;
    return (
      <div className="space-y-3 py-16 text-center text-slate-500">
        <p>{fr ? "Commande introuvable" : "Order not found"}</p>
        <Link href="/shop/orders" className="text-[var(--primary)] hover:underline">{fr ? "Mes commandes" : "My orders"}</Link>
      </div>
    );
  }

  const statusLabel = fr ? (STATUS_FR[order.status] ?? order.status) : order.status.replace(/_/g, " ");

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
      <PageHeader title={fr ? "Commande confirmée !" : "Order Confirmed!"} subtitle={order.reference} />
      <DetailSection title={fr ? "Résumé" : "Summary"}>
        <InfoGrid items={[
          { label: fr ? "N° de commande" : "Order ID", value: order.reference },
          { label: fr ? "Statut" : "Status", value: statusLabel },
          { label: "Total", value: <DualCurrency amount={order.amount} className="font-bold" /> },
          { label: fr ? "Articles" : "Items", value: order.itemsCount },
        ]} />
      </DetailSection>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={`/shop/orders/${order.id}`} className="btn-primary px-6 py-3">{fr ? "Voir la commande" : "View Order"}</Link>
        <Link href={`/shop/orders/${order.id}/tracking`} className="rounded-xl border px-6 py-3 text-sm font-medium">{fr ? "Suivre" : "Track"}</Link>
      </div>
    </div>
  );
}

export default function OrderConfirmedPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/orders/${id}/confirmed`}>
      <ConfirmedContent />
    </RequireSignIn>
  );
}
