"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerPromotionRequestPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [form, setForm] = useState({ name: "", type: "discount", value: "", start: "", end: "" });

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Demander une promotion" : "Request a Promotion"}
        subtitle={fr ? "Soumettez une demande — la plateforme l'examine et la publie" : "Submit a request — the platform reviews and publishes it"}
        backHref="/seller/promotions"
      />

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {fr
          ? "Les vendeurs ne créent pas de promotions directement. Votre demande est revue par l'équipe Somba avant publication."
          : "Sellers don't create promotions directly. Your request is reviewed by the Somba team before it goes live."}
      </div>

      <DetailSection title={fr ? "Détails de la demande" : "Request details"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Nom de la campagne" : "Campaign name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input-premium px-4 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="discount">{fr ? "Remise (%)" : "Discount (%)"}</option>
            <option value="coupon">{fr ? "Coupon" : "Coupon"}</option>
          </select>
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Valeur (ex. 15% ou CODE10)" : "Value (e.g. 15% or CODE10)"} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input-premium px-4 py-2 text-sm" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            <input className="input-premium px-4 py-2 text-sm" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
        </div>
        <button
          onClick={() => {
            if (!form.name.trim()) {
              toast(fr ? "Saisissez un nom de campagne" : "Enter a campaign name", "error");
              return;
            }
            toast(fr ? "Demande soumise pour approbation de la plateforme" : "Request submitted for platform approval");
            router.push("/seller/promotions");
          }}
          className="btn-primary mt-4 px-6 py-2.5 text-sm"
        >
          {fr ? "Soumettre la demande" : "Submit request"}
        </button>
      </DetailSection>
    </div>
  );
}
