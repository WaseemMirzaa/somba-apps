"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { getRiderTask } from "@/lib/rider-entities";

const REASONS = [
  { value: "Customer unavailable", labelFr: "Client indisponible" },
  { value: "Wrong address", labelFr: "Mauvaise adresse" },
  { value: "Refused delivery", labelFr: "Livraison refusée" },
  { value: "Payment issue", labelFr: "Problème de paiement" },
];

export default function RiderFailedDeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const task = getRiderTask(id);
  const [reason, setReason] = useState(REASONS[0].value);

  if (!task) return <div>{fr ? "Introuvable" : "Not found"}</div>;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title={fr ? "Livraison échouée" : "Failed Delivery"} subtitle={task.id} backHref={`/rider/tasks/${id}`} />
      <div className="card-premium space-y-4 p-6">
        <select className="input-premium w-full px-4 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => <option key={r.value} value={r.value}>{fr ? r.labelFr : r.value}</option>)}
        </select>
        <textarea className="input-premium w-full px-4 py-2 text-sm" rows={3} placeholder={fr ? "Notes" : "Notes"} />
        <Button onClick={() => { toast(fr ? "Échec enregistré — retour à l'entrepôt" : "Failed delivery logged — return to warehouse"); router.push("/rider/tasks"); }} className="w-full bg-red-600">
          {fr ? "Signaler l'échec" : "Report Failed Delivery"}
        </Button>
      </div>
    </div>
  );
}
