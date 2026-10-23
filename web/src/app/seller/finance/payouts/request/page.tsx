"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData, type SellerPayout } from "@/lib/seller";
import { errMessage, payoutMethodLabel, payoutStatusLabel, payoutStatusVariant } from "@/lib/seller-labels";

type Method = "bank" | "mobile_money" | "wallet";

export default function SellerPayoutRequestPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { requestPayout, availability, sellerPayoutSummary } = useSellerData();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("bank");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SellerPayout | null>(null);

  const available = availability?.available ?? 0;
  const amountNum = Number(amount);
  const needsAccount = method !== "wallet";

  const problems: string[] = [];
  if (!(amountNum > 0)) problems.push(fr ? "Saisissez un montant supérieur à 0." : "Enter an amount greater than 0.");
  else if (availability && amountNum > available + 0.001)
    problems.push(fr ? `Maximum disponible : ${formatCurrency(available, locale)}.` : `You can withdraw up to ${formatCurrency(available, locale)}.`);
  if (needsAccount && account.trim().length < 5)
    problems.push(
      method === "bank"
        ? fr ? "Indiquez le titulaire et l'IBAN / numéro de compte." : "Enter the account holder and IBAN / account number."
        : fr ? "Indiquez le titulaire et le numéro mobile money." : "Enter the account holder and mobile-money number.",
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payout = await requestPayout({
        amountUsd: amountNum,
        method,
        account: needsAccount ? account.trim() : undefined,
      });
      setCreated(payout);
      toast(fr ? "Demande de versement enregistrée" : "Payout request recorded");
    } catch (err) {
      const msg = errMessage(err);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="card-premium mx-auto max-w-lg space-y-3 p-8 text-center">
        <h2 className="text-xl font-bold text-emerald-700">{fr ? "Versement demandé" : "Payout Requested"}</h2>
        <p className="font-mono text-lg">{created.reference}</p>
        <p className="text-sm text-slate-600">
          {formatCurrency(created.amountUsd, locale)} · {payoutMethodLabel(created.method, fr)}
        </p>
        <div><Badge variant={payoutStatusVariant(created.status)}>{payoutStatusLabel(created.status, fr)}</Badge></div>
        <p className="text-xs text-slate-500">
          {fr ? "La finance doit approuver la demande ; le statut se met à jour ici en direct." : "Finance has to approve the request; its status updates live in your payouts list."}
        </p>
        <div className="flex justify-center gap-4 pt-2 text-sm">
          <Link href={`/seller/finance/payouts/${created.reference}`} className="text-[var(--primary)] hover:underline">{fr ? "Voir le détail" : "View details"}</Link>
          <Link href="/seller/finance/payouts" className="text-[var(--primary)] hover:underline">{fr ? "Voir les versements" : "View payouts"}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={fr ? "Demander un versement" : "Request Payout"}
        subtitle={
          availability
            ? fr ? `Disponible : ${formatCurrency(available, locale)}` : `Available: ${formatCurrency(available, locale)}`
            : fr ? "Chargement du solde…" : "Loading balance…"
        }
        backHref="/seller/finance/payouts"
      />

      {availability && (
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{fr ? "Gagné (net)" : "Earned (net)"}</p><p className="mt-1 text-base font-bold">{formatCurrency(availability.earned, locale)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{fr ? "Déjà demandé / versé" : "Already requested / paid"}</p><p className="mt-1 text-base font-bold">{formatCurrency(availability.committed, locale)}</p></div>
          <div className="rounded-xl bg-blue-50 p-3"><p className="text-slate-500">{fr ? "Disponible" : "Available"}</p><p className="mt-1 text-base font-bold text-[var(--primary)]">{formatCurrency(availability.available, locale)}</p></div>
        </div>
      )}
      <p className="text-xs text-slate-500">
        {fr
          ? `Gains = ventes livrées moins la commission de chaque commande (taux en vigueur à la commande ; ${sellerPayoutSummary.commissionPct} % pour les nouvelles).`
          : `Earned = delivered sales minus each order's commission (the rate in force when it was placed; ${sellerPayoutSummary.commissionPct}% for new orders).`}
      </p>

      <form onSubmit={submit} className="card-premium space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">{fr ? "Montant (USD)" : "Amount (USD)"}</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-premium w-full px-4 py-2.5 text-sm" placeholder={availability ? `max ${available.toFixed(2)}` : ""} max={availability ? available : undefined} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{fr ? "Méthode" : "Method"}</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="input-premium w-full px-4 py-2.5 text-sm">
            <option value="bank">{payoutMethodLabel("bank", fr)}</option>
            <option value="mobile_money">{payoutMethodLabel("mobile_money", fr)}</option>
            <option value="wallet">{payoutMethodLabel("wallet", fr)}</option>
          </select>
        </div>
        {needsAccount ? (
          <div>
            <label className="mb-1 block text-sm font-medium">
              {method === "bank"
                ? fr ? "Titulaire + IBAN / numéro de compte" : "Account holder + IBAN / account number"
                : fr ? "Titulaire + numéro mobile money" : "Account holder + mobile-money number"}
            </label>
            <input value={account} onChange={(e) => setAccount(e.target.value)} maxLength={250} className="input-premium w-full px-4 py-2.5 text-sm" placeholder={method === "bank" ? "Jane Doe, CD00 0000 0000 0000" : "Jane Doe, +243 8x xxx xxxx"} />
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            {fr ? "Le montant est crédité sur votre portefeuille Somba dès que la finance valide le versement." : "The amount is credited to your Somba wallet as soon as finance pays the payout."}
          </p>
        )}
        {amount !== "" || account !== "" ? (
          problems.length > 0 && (
            <ul className="space-y-1 text-xs text-red-600">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )
        ) : null}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || problems.length > 0}>
          {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Soumettre la demande de versement" : "Submit Payout Request"}
        </Button>
      </form>
    </div>
  );
}
