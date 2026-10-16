"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyDisputes, disputeStageLabel } from "@/lib/orders";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";

function ReturnStatus() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const rows = useMyDisputes();
  const ret = rows.find((d) => d.id === id || d.reference === id);

  if (!ret) {
    return (
      <div className="space-y-3 py-12 text-center text-slate-500">
        <p>{rt.status === "connected" ? (fr ? "Retour introuvable" : "Return not found") : (fr ? "Chargement…" : "Loading…")}</p>
        <Link href="/shop/returns" className="text-[var(--primary)] hover:underline">{fr ? "Tous mes retours" : "All my returns"}</Link>
      </div>
    );
  }

  const order = rt.orders.find((o) => o.id === ret.orderId);

  return (
    <div className="space-y-6">
      <PageHeader title={ret.reference} subtitle={`${fr ? "Commande" : "Order"} ${ret.orderReference}`} backHref="/shop/returns" />
      <DetailSection title={ret.type === "return" ? (fr ? "Statut du retour" : "Return status") : (fr ? "Statut du litige" : "Dispute status")}>
        <InfoGrid items={[
          { label: fr ? "Statut" : "Status", value: disputeStageLabel(ret, fr) },
          { label: fr ? "Type" : "Type", value: ret.type === "return" ? (fr ? "Retour" : "Return") : (fr ? "Litige" : "Dispute") },
          { label: fr ? "Demandé le" : "Requested", value: new Date(ret.createdAt).toLocaleString() },
          ...(ret.receivedAt ? [{ label: fr ? "Colis reçu le" : "Goods received", value: new Date(ret.receivedAt).toLocaleString() }] : []),
          { label: fr ? "Raison" : "Reason", value: ret.reason, full: true },
          ...(ret.resolution ? [{ label: fr ? "Décision" : "Decision", value: ret.resolution, full: true }] : []),
          ...(order ? [{ label: fr ? "Montant de la commande" : "Order total", value: `$${order.totalUsd.toFixed(2)}` }] : []),
        ]} />
        <Link href={`/shop/orders/${ret.orderId}`} className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
          {fr ? "Voir la commande →" : "View order →"}
        </Link>
      </DetailSection>
    </div>
  );
}

export default function ReturnStatusPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/returns/${id}`}>
      <ReturnStatus />
    </RequireSignIn>
  );
}
