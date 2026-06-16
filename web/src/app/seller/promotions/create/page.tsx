"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useToast } from "@/context/toast-context";

export default function SellerPromotionCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", discount: "", start: "", end: "" });

  return (
    <div className="space-y-6">
      <PageHeader title="Create Campaign" subtitle="Select products, set discount, schedule" backHref="/seller/promotions" />
      <DetailSection title="Campaign Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" placeholder="Campaign Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" placeholder="Discount %" type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <input className="rounded-lg border border-sky-200 px-4 py-2 text-sm" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <button
          onClick={() => {
            if (!form.name.trim()) { toast("Enter a campaign name", "error"); return; }
            toast("Campaign submitted for approval");
            router.push("/seller/promotions");
          }}
          className="mt-4 btn-primary rounded-lg px-6 py-2 text-sm"
        >
          Submit for Approval
        </button>
      </DetailSection>
    </div>
  );
}
