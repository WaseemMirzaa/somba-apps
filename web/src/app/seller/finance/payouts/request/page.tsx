"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/seller/countdown";
import { FinanceRules } from "@/components/seller/finance-rules";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess, useSellerData, type SellerPayout } from "@/lib/seller";
import { sellerRequest } from "@/lib/seller-api";
import { useFinanceBalance, usePayoutAccount } from "@/lib/seller-finance";
import { errMessage, payoutMethodLabel, payoutStatusLabel, payoutStatusVariant } from "@/lib/seller-labels";

type Method = "bank" | "mobile_money" | "wallet";

/**
 * Ask for a payout. Checked against the server's own numbers (what can be withdrawn after the clearance hold, the
 * minimum payout) before it is sent; a team member can only pay out to the account the owner saved (or the wallet).
 */
export default function SellerPayoutRequestPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const { toast } = useToast();
  const { requestPayout } = useSellerData();
  const access = useSellerAccess();
  const balance = useFinanceBalance();
  const saved = usePayoutAccount();
  const [amount, setAmount] = useState("");
  // What the person typed / picked; until then the owner starts from the destination they saved.
  const [methodChoice, setMethod] = useState<Method | null>(null);
  const [accountInput, setAccount] = useState<string | null>(null);
  const [saveAccount, setSaveAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SellerPayout | null>(null);
  const money = (n: number) => formatCurrency(n, locale);

  const b = balance.data;
  const savedAccount = saved.data;
  const isOwner = access.isOwner;
  const available = b?.available ?? 0;
  const min = b?.minPayoutUsd ?? 0;
  const amountNum = Number(amount);
  const ownerSaved = isOwner && savedAccount?.set ? savedAccount : null;
  const method: Method = methodChoice ?? ownerSaved?.method ?? "bank";
  const account = accountInput ?? ((!methodChoice || methodChoice === ownerSaved?.method ? ownerSaved?.account : null) ?? "");
  const needsAccount = method !== "wallet";
  const staffSaved = !isOwner && needsAccount ? savedAccount : null;

  // A redirect to the payout once the success card has been read.
  useEffect(() => {
    if (!created) return;
    const id = window.setTimeout(() => router.push(`/seller/finance/payouts/${created.reference}`), 4000);
    return () => window.clearTimeout(id);
  }, [created, router]);

  const problems: string[] = [];
  if (b) {
    if (available < min)
      problems.push(
        fr
          ? `Solde retirable (${money(available)}) inférieur au versement minimum (${money(min)}).`
          : `Your withdrawable balance (${money(available)}) is below the minimum payout (${money(min)}).`,
      );
    else if (!(amountNum > 0)) problems.push(fr ? "Saisissez un montant supérieur à 0." : "Enter an amount greater than 0.");
    else if (amountNum < min) problems.push(fr ? `Le versement minimum est de ${money(min)}.` : `The minimum payout is ${money(min)}.`);
    else if (amountNum > available + 0.001)
      problems.push(fr ? `Vous pouvez retirer jusqu'à ${money(available)} pour le moment.` : `You can withdraw up to ${money(available)} right now.`);
  }
  if (needsAccount && isOwner && account.trim().length < 5)
    problems.push(
      method === "bank"
        ? fr ? "Indiquez le titulaire et l'IBAN / numéro de compte (5 caractères minimum)." : "Enter the account holder and IBAN / account number (5 characters minimum)."
        : fr ? "Indiquez le titulaire et le numéro mobile money (5 caractères minimum)." : "Enter the account holder and mobile-money number (5 characters minimum).",
    );
  if (staffSaved && !staffSaved.set)
    problems.push(
      fr
        ? "Le propriétaire n'a pas encore enregistré de compte de versement : choisissez le portefeuille ou demandez-lui d'en enregistrer un."
        : "The store owner has not saved a payout account yet: choose the wallet, or ask them to save one.",
    );

  const showProblems = amount !== "" || account !== "" || (!!b && available < min);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payout = await requestPayout({
        amountUsd: amountNum,
        method,
        account: needsAccount && isOwner ? account.trim() : undefined,
      });
      if (isOwner && needsAccount && saveAccount) {
        try {
          await sellerRequest("sellers:payoutAccount:set", { method, account: account.trim() });
          await saved.reload();
        } catch (e2) {
          toast(errMessage(e2), "error");
        }
      }
      await balance.reload();
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
      <div className="card-premium mx-auto max-w-lg space-y-3 p-8 text-center" data-testid="payout-created">
        <h2 className="text-xl font-bold text-emerald-700">{fr ? "Versement demandé" : "Payout Requested"}</h2>
        <p className="font-mono text-lg">{created.reference}</p>
        <p className="text-sm text-slate-600">
          {formatCurrency(created.amountUsd, locale)} · {payoutMethodLabel(created.method, fr)}
        </p>
        <div>
          <Badge variant={payoutStatusVariant(created.status)}>{payoutStatusLabel(created.status, fr)}</Badge>
        </div>
        <p className="text-xs text-slate-500">
          {fr
            ? "La finance doit approuver la demande ; le statut se met à jour en direct. Vous allez être redirigé vers le détail du versement."
            : "Finance has to approve the request; its status updates live. You are being taken to the payout's details."}
        </p>
        <div className="flex justify-center gap-4 pt-2 text-sm">
          <Link href={`/seller/finance/payouts/${created.reference}`} className="text-[var(--primary)] hover:underline">
            {fr ? "Voir le détail" : "View details"}
          </Link>
          <Link href="/seller/finance/payouts" className="text-[var(--primary)] hover:underline">
            {fr ? "Voir les versements" : "View payouts"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={fr ? "Demander un versement" : "Request Payout"}
        subtitle={b ? (fr ? `Retirable maintenant : ${money(available)}` : `Withdrawable now: ${money(available)}`) : fr ? "Chargement du solde…" : "Loading balance…"}
        backHref="/seller/finance/payouts"
      />

      {balance.error && <LoadError message={balance.error} onRetry={balance.reload} />}
      {balance.loading && !b && <SectionLoader />}

      {b && (
        <>
          <div className="grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4" data-testid="payout-balance">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">{fr ? "Gagné (net)" : "Earned (net)"}</p>
              <p className="mt-1 break-words text-base font-bold">{money(b.earned)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">{fr ? "Déjà demandé / versé" : "Already requested / paid"}</p>
              <p className="mt-1 break-words text-base font-bold">{money(b.committed)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-slate-500">{fr ? "En délai de sécurité" : "Clearing"}</p>
              <p className="mt-1 break-words text-base font-bold">{money(b.clearingUsd)}</p>
              {b.clearingUsd > 0 && b.nextClearanceAt && (
                <div className="mt-1">
                  <Countdown until={b.nextClearanceAt} />
                </div>
              )}
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-slate-500">{fr ? "Retirable" : "Withdrawable"}</p>
              <p className="mt-1 break-words text-base font-bold text-[var(--primary)]">{money(b.available)}</p>
            </div>
          </div>
          <FinanceRules balance={b} stack />
        </>
      )}

      <form onSubmit={submit} className="card-premium space-y-4 p-6">
        <div>
          <label htmlFor="payout-amount" className="mb-1 block text-sm font-medium">
            {fr ? "Montant (USD)" : "Amount (USD)"}
          </label>
          <input
            id="payout-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-premium w-full px-4 py-2.5 text-sm"
            placeholder={b ? `${money(min)} – ${money(available)}` : ""}
          />
          {b && available >= min && (
            <button type="button" onClick={() => setAmount(available.toFixed(2))} className="mt-1 text-xs text-[var(--primary)] hover:underline">
              {fr ? `Tout retirer (${money(available)})` : `Withdraw everything (${money(available)})`}
            </button>
          )}
        </div>
        <div>
          <label htmlFor="payout-method" className="mb-1 block text-sm font-medium">
            {fr ? "Méthode" : "Method"}
          </label>
          <select id="payout-method" value={method} onChange={(e) => setMethod(e.target.value as Method)} className="input-premium w-full px-4 py-2.5 text-sm">
            <option value="bank">{payoutMethodLabel("bank", fr)}</option>
            <option value="mobile_money">{payoutMethodLabel("mobile_money", fr)}</option>
            <option value="wallet">{payoutMethodLabel("wallet", fr)}</option>
          </select>
        </div>

        {needsAccount && isOwner && (
          <div>
            <label htmlFor="payout-account" className="mb-1 block text-sm font-medium">
              {method === "bank"
                ? fr ? "Titulaire + IBAN / numéro de compte" : "Account holder + IBAN / account number"
                : fr ? "Titulaire + numéro mobile money" : "Account holder + mobile-money number"}
            </label>
            <input
              id="payout-account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              maxLength={250}
              className="input-premium w-full px-4 py-2.5 text-sm"
              placeholder={method === "bank" ? "Jane Doe, CD00 0000 0000 0000" : "Jane Doe, +243 8x xxx xxxx"}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={saveAccount} onChange={(e) => setSaveAccount(e.target.checked)} />
              {fr ? "Enregistrer comme compte de versement de la boutique (utilisé par votre équipe)" : "Save as the store's payout account (used by your team)"}
            </label>
            {savedAccount?.set && (
              <p className="mt-1 text-xs text-slate-500">
                {fr ? "Compte enregistré : " : "Saved account: "}
                {savedAccount.masked}
              </p>
            )}
          </div>
        )}

        {staffSaved && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {staffSaved.set
              ? fr
                ? `Le versement sera envoyé au compte enregistré par le propriétaire (${staffSaved.masked}).`
                : `The payout goes to the account the owner saved (${staffSaved.masked}).`
              : fr
                ? "Aucun compte de versement enregistré par le propriétaire."
                : "The owner has not saved a payout account."}
          </p>
        )}

        {!needsAccount && (
          <p className="text-xs text-slate-500">
            {fr ? "Le montant est crédité sur votre portefeuille Somba dès que la finance valide le versement." : "The amount is credited to your Somba wallet as soon as finance pays the payout."}
          </p>
        )}

        {showProblems && problems.length > 0 && (
          <ul className="space-y-1 text-xs text-red-600" data-testid="payout-problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !b || problems.length > 0}>
          {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Soumettre la demande de versement" : "Submit Payout Request"}
        </Button>
      </form>
    </div>
  );
}
