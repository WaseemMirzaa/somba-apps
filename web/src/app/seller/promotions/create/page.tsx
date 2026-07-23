"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";

export default function SellerPromotionCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useLocale();
  const { createCampaign } = useSellerData();
  const fr = locale === "fr";
  const [form, setForm] = useState({ name: "", discount: "", start: "", end: "" });

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Créer une campagne" : "Create Campaign"} subtitle={fr ? "Sélectionnez les produits, définissez la remise, planifiez" : "Select products, set discount, schedule"} backHref="/seller/promotions" />
      <DetailSection title={fr ? "Détails de la campagne" : "Campaign Details"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" placeholder={fr ? "Nom de la campagne" : "Campaign Name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" placeholder={fr ? "Remise %" : "Discount %"} type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <button
          onClick={async () => {
            if (!form.name.trim()) { toast(fr ? "Saisissez un nom de campagne" : "Enter a campaign name", "error"); return; }
            await createCampaign({ name: form.name, discount: Number(form.discount) || 0, startDate: form.start, endDate: form.end });
            toast(fr ? "Campagne soumise pour approbation" : "Campaign submitted for approval");
            router.push("/seller/promotions");
          }}
          className="mt-4 btn-primary rounded-lg px-6 py-2 text-sm"
        >
          {fr ? "Soumettre pour approbation" : "Submit for Approval"}
        </button>
      </DetailSection>
    </div>
  );
}
