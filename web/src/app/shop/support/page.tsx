"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";

export default function ShopSupportPage() {
  const { t } = useLocale();
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title={t("support")}
        subtitle="We're here to help"
        breadcrumbs={[
          { label: "Shop", href: "/" },
          { label: t("support") },
        ]}
      />

      {submitted ? (
        <div className="card-premium p-8 text-center">
          <p className="font-semibold text-emerald-700">Ticket submitted successfully!</p>
          <p className="mt-2 text-sm text-slate-500">Reference: TKT-2024-8891 — We&apos;ll respond within 24h.</p>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
          className="card-premium space-y-5 p-6"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Subject</label>
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="Order issue, return, payment..." />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Order ID (optional)</label>
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="ORD-2024-XXXX" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Message</label>
            <textarea className="input-premium w-full px-4 py-2.5 text-sm" rows={4} placeholder="Describe your issue..." />
          </div>
          <Button type="submit">Submit Ticket</Button>
        </form>
      )}
    </div>
  );
}
