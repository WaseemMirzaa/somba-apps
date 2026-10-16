"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";

export default function SellerPromotionCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useLocale();
  const { createCampaign } = useSellerData();
  const fr = locale === "fr";
  const [form, setForm] = useState({ name: "", discount: "", start: "", end: "", budget: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discount = form.discount === "" ? 0 : Number(form.discount);
  const problems: string[] = [];
  if (form.name.trim().length < 2) problems.push(fr ? "Saisissez un nom de campagne." : "Enter a campaign name.");
  if (!Number.isFinite(discount) || discount < 0 || discount > 90) problems.push(fr ? "La remise doit être comprise entre 0 et 90 %." : "Discount must be between 0 and 90%.");
  if (form.start && form.end && form.end < form.start) problems.push(fr ? "La date de fin précède la date de début." : "The end date is before the start date.");

  async function submit() {
    if (problems.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createCampaign({
        name: form.name.trim(),
        discount,
        startDate: form.start || undefined,
        endDate: form.end || undefined,
        budgetUsd: form.budget ? Number(form.budget) : undefined,
      });
      toast(fr ? "Campagne soumise pour approbation" : "Campaign submitted for approval");
      router.push("/seller/promotions");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
      setBusy(false);
    }
  }

  const field = "rounded-lg border border-sky-200 px-4 py-2 text-sm";
  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Créer une campagne" : "Create Campaign"} subtitle={fr ? "Nom, remise, période, budget : le marketing approuve ensuite" : "Name, discount, schedule, budget: marketing approves it afterwards"} backHref="/seller/promotions" />
      <DetailSection title={fr ? "Détails de la campagne" : "Campaign Details"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className={field} placeholder={fr ? "Nom de la campagne" : "Campaign Name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} />
          <input className={field} placeholder={fr ? "Remise % (0-90)" : "Discount % (0-90)"} type="number" min="0" max="90" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          <label className="text-xs text-slate-500">{fr ? "Début" : "Start"}<input className={`${field} mt-1 w-full`} type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
          <label className="text-xs text-slate-500">{fr ? "Fin" : "End"}<input className={`${field} mt-1 w-full`} type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
          <input className={field} placeholder={fr ? "Budget USD (optionnel)" : "Budget USD (optional)"} type="number" min="0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        </div>
        {(form.name !== "" || form.discount !== "") && problems.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-red-600">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button onClick={() => void submit()} disabled={busy || problems.length > 0} className="mt-4 btn-primary rounded-lg px-6 py-2 text-sm disabled:opacity-50">
          {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Soumettre pour approbation" : "Submit for Approval"}
        </button>
      </DetailSection>
    </div>
  );
}
