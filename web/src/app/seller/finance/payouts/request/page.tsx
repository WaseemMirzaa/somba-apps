"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerPayoutRequestPage() {
  const { locale } = useLocale();
  const [submitted, setSubmitted] = useState(false);
  const available = 12450;

  if (submitted) {
    return (
      <div className="card-premium mx-auto max-w-lg p-8 text-center">
        <h2 className="text-xl font-bold text-emerald-700">Payout Requested</h2>
        <p className="mt-2 text-sm text-slate-500">PAY-REQ-2024-089 — Processing in 2-3 business days</p>
        <Link href="/seller/finance/payouts" className="mt-4 inline-block text-blue-600">View payouts</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Request Payout" subtitle={`Available: ${formatCurrency(available, locale)}`} backHref="/seller/finance/payouts" />

      <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="card-premium space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Amount (USD)</label>
          <input type="number" className="input-premium w-full px-4 py-2.5 text-sm" placeholder="Max 12,450" max={available} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Bank Name</label>
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="BNP Paribas" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">IBAN / Account Number</label>
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="FR76 XXXX XXXX XXXX" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Account Holder</label>
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="TechZone Store SARL" />
        </div>
        <Button type="submit" className="w-full">Submit Payout Request</Button>
      </form>
    </div>
  );
}
