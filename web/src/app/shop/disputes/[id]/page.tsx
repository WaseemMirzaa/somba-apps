"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";

export default function ShopDisputePage() {
  const { id } = useParams<{ id: string }>();
  const { getDispute } = useDisputes();
  const { locale } = useLocale();
  const dispute = getDispute(id);

  if (!dispute) return <div className="text-center text-slate-500">Dispute not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={dispute.id} subtitle={`${dispute.orderId} · ${dispute.status}`} backHref="/shop/orders" />
      <DetailSection title={locale === "fr" ? "Détails" : "Details"}>
        <p className="text-sm"><strong>{locale === "fr" ? "Vendeur" : "Seller"}:</strong> {dispute.sellerName}</p>
        <p className="mt-2 text-sm">{dispute.description}</p>
      </DetailSection>
      <DetailSection title={locale === "fr" ? "Messages" : "Messages"}>
        <div className="space-y-3">
          {dispute.messages.map((m, i) => (
            <div key={i} className={`rounded-lg p-3 text-sm ${m.from === "buyer" ? "bg-blue-50" : "bg-slate-50"}`}>
              <p className="text-xs font-medium uppercase text-slate-400">{m.from}</p>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}
