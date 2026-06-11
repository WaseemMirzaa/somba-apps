"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";

const REASON_KEYS = [
  "exchangeReasonWrongSize",
  "exchangeReasonWrongColor",
  "exchangeReasonDefective",
  "exchangeReasonDifferentVariant",
] as const;

export default function ShopExchangePage() {
  const { t } = useLocale();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="card-premium p-8">
          <h2 className="text-xl font-bold text-emerald-700">{t("exchangeRequested")}</h2>
          <p className="mt-2 text-sm text-slate-500">EXC-2024-001 — {t("pickupReplacementScheduled")}</p>
          <Link href="/shop/orders" className="mt-4 inline-block text-blue-600">{t("myOrders")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title={t("requestExchange")} subtitle="ORD-2024-001" backHref="/shop/orders/ORD-2024-001" />

      {step === 1 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">{t("selectItem")}</h3>
          <label className="flex gap-3 rounded-xl border p-4">
            <input type="radio" defaultChecked />
            <span>Nike Air Max 270 — Size 42</span>
          </label>
          <Button onClick={() => setStep(2)} className="w-full">{t("continueBtn")}</Button>
        </div>
      )}

      {step === 2 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">{t("exchangeReason")}</h3>
          {REASON_KEYS.map((key) => (
            <label key={key} className="flex gap-3 rounded-xl border p-4">
              <input type="radio" name="reason" />
              <span>{t(key)}</span>
            </label>
          ))}
          <h3 className="font-semibold pt-2">{t("preferredReplacement")}</h3>
          <select className="input-premium w-full px-4 py-2.5 text-sm">
            <option>{t("replacementSize43SameColor")}</option>
            <option>{t("replacementSize42Black")}</option>
          </select>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">{t("back")}</Button>
            <Button onClick={() => setStep(3)} className="flex-1">{t("continueBtn")}</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">{t("confirmExchange")}</h3>
          <p className="text-sm text-slate-600">{t("openBoxDeliveryDesc")}</p>
          <Button onClick={() => setDone(true)} className="w-full">{t("submitExchange")}</Button>
        </div>
      )}
    </div>
  );
}
