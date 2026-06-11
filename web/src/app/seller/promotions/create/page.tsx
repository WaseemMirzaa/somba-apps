"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function SellerPromotionCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useLocale();
  const [form, setForm] = useState({ name: "", discount: "", start: "", end: "" });

  return (
    <div className="space-y-6">
      <PageHeader title={t("promotionCreate")} subtitle={t("promotionCreateSubtitle")} backHref="/seller/promotions" />
      <DetailSection title={t("campaignDetails")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" placeholder={t("campaignName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" placeholder={`${t("discountPct")} %`} type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <button
          onClick={() => {
            if (!form.name.trim()) { toast(t("enterCampaignName"), "error"); return; }
            toast(t("campaignSubmittedForApproval"));
            router.push("/seller/promotions");
          }}
          className="mt-4 rounded-lg bg-sky-600 px-6 py-2 text-sm text-white"
        >
          {t("submitForApproval")}
        </button>
      </DetailSection>
    </div>
  );
}
