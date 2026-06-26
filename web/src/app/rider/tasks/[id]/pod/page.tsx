"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { getRiderTask } from "@/lib/rider-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function RiderPodPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const task = getRiderTask(id);
  const [otp, setOtp] = useState("");
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");

  if (!task) return <div className="text-center text-slate-500">{fr ? "Tâche introuvable" : "Task not found"}</div>;

  function confirmDelivery() {
    toast(fr ? "Livraison confirmée" : "Delivery confirmed");
    router.push("/rider/tasks");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={fr ? "Preuve de livraison" : "Proof of Delivery"} subtitle={task.id} backHref={`/rider/tasks/${id}`} />

      <DetailSection title={fr ? "Détails" : "Details"}>
        <InfoGrid items={[
          { label: t("customer"), value: task.customer },
          { label: fr ? "Commande" : "Order", value: task.orderId },
          { label: fr ? "Destinataire" : "Recipient", value: recipient || "—" },
        ]} />
      </DetailSection>

      <DetailSection title={fr ? "Vérification" : "Verification"}>
        <div className="space-y-3">
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Nom du destinataire" : "Recipient name"} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          <textarea className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Notes" : "Notes"} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            {fr ? "Photo / Signature (mock)" : "Photo / Signature (mock upload)"}
          </div>
        </div>
        <Button onClick={confirmDelivery} className="mt-4 w-full bg-emerald-600">
          {fr ? "Confirmer livraison" : "Confirm Delivered"}
        </Button>
      </DetailSection>
    </div>
  );
}
