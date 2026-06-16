"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerPayoutRequestPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [submitted, setSubmitted] = useState(false);
  const available = 12450;

  if (submitted) {
    return (
      <div className="card-premium mx-auto max-w-lg p-8 text-center">
        <h2 className="text-xl font-bold text-emerald-700">{fr ? "Versement demandé" : "Payout Requested"}</h2>
        <p className="mt-2 text-sm text-slate-500">{fr ? "PAY-REQ-2024-089 — Traitement sous 2 à 3 jours ouvrés" : "PAY-REQ-2024-089 — Processing in 2-3 business days"}</p>
        <Link href="/seller/finance/payouts" className="mt-4 inline-block text-[var(--primary)]">{fr ? "Voir les versements" : "View payouts"}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={fr ? "Demander un versement" : "Request Payout"} subtitle={fr ? `Disponible : ${formatCurrency(available, locale)}` : `Available: ${formatCurrency(available, locale)}`} backHref="/seller/finance/payouts" />

      <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="card-premium space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">{fr ? "Montant (USD)" : "Amount (USD)"}</label>
          <input type="number" className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Max 12 450" : "Max 12,450"} max={available} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{fr ? "Nom de la banque" : "Bank Name"}</label>
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="BNP Paribas" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{fr ? "IBAN / Numéro de compte" : "IBAN / Account Number"}</label>
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="FR76 XXXX XXXX XXXX" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{fr ? "Titulaire du compte" : "Account Holder"}</label>
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="TechZone Store SARL" />
        </div>
        <Button type="submit" className="w-full">{fr ? "Soumettre la demande de versement" : "Submit Payout Request"}</Button>
      </form>
    </div>
  );
}
