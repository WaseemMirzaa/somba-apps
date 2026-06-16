"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";

const STATUS_LABELS: Record<string, string> = {
  open: "Ouvert",
  "in review": "En cours d'examen",
  in_review: "En cours d'examen",
  seller_responded: "Vendeur a répondu",
  pending: "En attente",
  resolved: "Résolu",
  approved: "Approuvé",
  rejected: "Rejeté",
  closed: "Fermé",
};

export default function ShopDisputePage() {
  const { id } = useParams<{ id: string }>();
  const { getDispute } = useDisputes();
  const { locale } = useLocale();
  const dispute = getDispute(id);
  const fr = locale === "fr";

  if (!dispute) return <div className="text-center text-slate-500">{fr ? "Litige introuvable" : "Dispute not found"}</div>;

  const statusLabel = fr ? (STATUS_LABELS[dispute.status?.toLowerCase()] ?? dispute.status) : dispute.status;

  return (
    <div className="space-y-6">
      <PageHeader title={dispute.id} subtitle={`${dispute.orderId} · ${statusLabel}`} backHref="/shop/orders" />
      <DetailSection title={locale === "fr" ? "Détails" : "Details"}>
        <p className="text-sm"><strong>{locale === "fr" ? "Vendeur" : "Seller"}:</strong> {dispute.sellerName}</p>
        <p className="mt-2 text-sm">{fr ? (dispute.descriptionFr ?? dispute.description) : dispute.description}</p>
      </DetailSection>
      <DetailSection title={locale === "fr" ? "Messages" : "Messages"}>
        <div className="space-y-3">
          {dispute.messages.map((m, i) => (
            <div key={i} className={`rounded-lg p-3 text-sm ${m.from === "buyer" ? "bg-blue-50" : "bg-slate-50"}`}>
              <p className="text-xs font-medium uppercase text-slate-400">{fr ? (m.from === "buyer" ? "Acheteur" : m.from === "seller" ? "Vendeur" : "Assistance") : m.from}</p>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}
