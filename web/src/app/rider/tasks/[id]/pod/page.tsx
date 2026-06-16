"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { DualCurrency } from "@/components/ui/dual-currency";
import { getRiderTask } from "@/lib/rider-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function RiderPodPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const task = getRiderTask(id);
  const [otp, setOtp] = useState("");
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [codCollected, setCodCollected] = useState(false);

  if (!task) return <div className="text-center text-slate-500">Task not found</div>;

  const currentTask = task;

  function confirmDelivery() {
    if (currentTask.codAmount && !codCollected) {
      toast(locale === "fr" ? "Confirmez la collecte du paiement" : "Confirm payment collection");
      return;
    }
    toast(locale === "fr" ? "Livraison confirmée" : "Delivery confirmed");
    router.push("/rider/tasks");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={locale === "fr" ? "Preuve de livraison" : "Proof of Delivery"} subtitle={task.id} backHref={`/rider/tasks/${id}`} />

      <DetailSection title={locale === "fr" ? "Détails" : "Details"}>
        <InfoGrid items={[
          { label: "Customer", value: task.customer },
          { label: "Order", value: task.orderId },
          { label: locale === "fr" ? "Destinataire" : "Recipient", value: recipient || "—" },
        ]} />
      </DetailSection>

      {task.codAmount && (
        <div className="card-premium border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-medium text-emerald-800">{locale === "fr" ? "Montant à collecter" : "Amount Due"}</p>
          <DualCurrency amount={task.codAmount} className="text-2xl font-bold text-emerald-700" />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={codCollected} onChange={(e) => setCodCollected(e.target.checked)} />
            {locale === "fr" ? "Espèces collectées" : "Cash collected"}
          </label>
        </div>
      )}

      <DetailSection title="Verification">
        <div className="space-y-3">
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={locale === "fr" ? "Nom du destinataire" : "Recipient name"} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          <textarea className="input-premium w-full px-4 py-2 text-sm" placeholder={locale === "fr" ? "Notes" : "Notes"} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            {locale === "fr" ? "Photo / Signature (mock)" : "Photo / Signature (mock upload)"}
          </div>
        </div>
        <Button onClick={confirmDelivery} className="mt-4 w-full bg-emerald-600">
          {locale === "fr" ? "Confirmer livraison" : "Confirm Delivered"}
        </Button>
      </DetailSection>
    </div>
  );
}
