"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { getOrder } from "@/lib/entities";
import { useLocale } from "@/context/locale-context";
import { formatPaymentMethod } from "@/lib/utils";

const reasons = [
  "Defective or damaged item",
  "Wrong item received",
  "Item not as described",
  "Changed my mind",
  "Other",
];

export default function ShopOrderReturnPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const order = getOrder(id);

  if (!order) {
    return <div className="text-center text-slate-500">Order not found</div>;
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="card-premium p-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-2xl">
            ✓
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
            Return Request Submitted
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Reference: RET-{id} — Pickup scheduled within 2 business days.
          </p>
          <Link href={`/shop/orders/${id}`} className="mt-6 inline-block text-sm font-semibold text-[var(--primary)]">
            ← Back to order
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title={t("startReturn")}
        subtitle={`Order ${order.id}`}
        backHref={`/shop/orders/${id}`}
        breadcrumbs={[
          { label: "Orders", href: "/shop/orders" },
          { label: order.id, href: `/shop/orders/${id}` },
          { label: t("returns") },
        ]}
      />

      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-[var(--primary)]" : "bg-slate-200"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">Select items to return</h3>
          {order.items.map((item) => (
            <label key={item.sku} className="flex items-center gap-4 rounded-xl border border-[var(--border)] p-4 cursor-pointer hover:border-blue-200">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]" />
              <div className="flex-1">
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">Qty: {item.qty}</p>
              </div>
            </label>
          ))}
          <Button onClick={() => setStep(2)} className="w-full">Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">{t("returnReason")}</h3>
          {reasons.map((r) => (
            <label key={r} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-4 cursor-pointer hover:border-blue-200">
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="h-4 w-4 text-[var(--primary)]"
              />
              <span className="text-sm text-slate-700">{r}</span>
            </label>
          ))}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">Back</Button>
            <Button onClick={() => setStep(3)} disabled={!reason} className="flex-1">Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">Confirm return</h3>
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong>Order:</strong> {order.id}</p>
            <p><strong>Reason:</strong> {reason}</p>
            <p><strong>Refund method:</strong> Original payment ({formatPaymentMethod(order.paymentMethod, locale)})</p>
            <p className="mt-2 text-xs text-slate-500">Pickup from: {order.customerAddress}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">Back</Button>
            <Button onClick={() => setSubmitted(true)} className="flex-1">{t("submitReturn")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
