"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

const reasons = ["Wrong size", "Wrong color", "Defective — exchange", "Prefer different variant"];

export default function ShopExchangePage() {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="card-premium p-8">
          <h2 className="text-xl font-bold text-emerald-700">Exchange Requested</h2>
          <p className="mt-2 text-sm text-slate-500">EXC-2024-001 — Pickup & replacement scheduled</p>
          <Link href="/shop/orders" className="mt-4 inline-block text-[var(--primary)]">View orders</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Request Exchange" subtitle="ORD-2024-001" backHref="/shop/orders/ORD-2024-001" />

      {step === 1 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">Select item</h3>
          <label className="flex gap-3 rounded-xl border p-4">
            <input type="radio" defaultChecked />
            <span>Nike Air Max 270 — Size 42</span>
          </label>
          <Button onClick={() => setStep(2)} className="w-full">Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">Exchange reason</h3>
          {reasons.map((r) => (
            <label key={r} className="flex gap-3 rounded-xl border p-4">
              <input type="radio" name="reason" />
              <span>{r}</span>
            </label>
          ))}
          <h3 className="font-semibold pt-2">Preferred replacement</h3>
          <select className="input-premium w-full px-4 py-2.5 text-sm">
            <option>Size 43 — Same color</option>
            <option>Size 42 — Black</option>
          </select>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">Back</Button>
            <Button onClick={() => setStep(3)} className="flex-1">Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">Confirm exchange</h3>
          <p className="text-sm text-slate-600">Open box inspection available at delivery. No extra charge for size exchange.</p>
          <Button onClick={() => setDone(true)} className="w-full">Submit Exchange</Button>
        </div>
      )}
    </div>
  );
}
