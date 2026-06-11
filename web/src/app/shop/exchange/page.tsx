"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";

const reasons = [
  { en: "Wrong size", fr: "Mauvaise taille" },
  { en: "Wrong color", fr: "Mauvaise couleur" },
  { en: "Defective — exchange", fr: "Défectueux — échange" },
  { en: "Prefer different variant", fr: "Autre variante préférée" },
];

export default function ShopExchangePage() {
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="card-premium p-8">
          <h2 className="text-xl font-bold text-emerald-700">{fr ? "Échange demandé" : "Exchange Requested"}</h2>
          <p className="mt-2 text-sm text-slate-500">EXC-2024-001 — {fr ? "Enlèvement et remplacement planifiés" : "Pickup & replacement scheduled"}</p>
          <Link href="/shop/orders" className="mt-4 inline-block text-blue-600">{t("myOrders")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title={fr ? "Demander un échange" : "Request Exchange"} subtitle="ORD-2024-001" backHref="/shop/orders/ORD-2024-001" />

      {step === 1 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">{fr ? "Sélectionner l'article" : "Select item"}</h3>
          <label className="flex gap-3 rounded-xl border p-4">
            <input type="radio" defaultChecked />
            <span>Nike Air Max 270 — Size 42</span>
          </label>
          <Button onClick={() => setStep(2)} className="w-full">{fr ? "Continuer" : "Continue"}</Button>
        </div>
      )}

      {step === 2 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">{fr ? "Motif d'échange" : "Exchange reason"}</h3>
          {reasons.map((r) => (
            <label key={r.en} className="flex gap-3 rounded-xl border p-4">
              <input type="radio" name="reason" />
              <span>{fr ? r.fr : r.en}</span>
            </label>
          ))}
          <h3 className="font-semibold pt-2">{fr ? "Remplacement souhaité" : "Preferred replacement"}</h3>
          <select className="input-premium w-full px-4 py-2.5 text-sm">
            <option>{fr ? "Taille 43 — Même couleur" : "Size 43 — Same color"}</option>
            <option>{fr ? "Taille 42 — Noir" : "Size 42 — Black"}</option>
          </select>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">{t("back")}</Button>
            <Button onClick={() => setStep(3)} className="flex-1">{fr ? "Continuer" : "Continue"}</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">{fr ? "Confirmer l'échange" : "Confirm exchange"}</h3>
          <p className="text-sm text-slate-600">{t("openBoxDeliveryDesc")}</p>
          <Button onClick={() => setDone(true)} className="w-full">{fr ? "Soumettre l'échange" : "Submit Exchange"}</Button>
        </div>
      )}
    </div>
  );
}
