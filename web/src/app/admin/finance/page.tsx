"use client";

import { useState } from "react";
import Link from "next/link";
import { DollarSign, Wallet, CreditCard, Percent, Receipt, Banknote, Smartphone, PiggyBank, Tag, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { DailyBarChart } from "@/components/admin/series-charts";
import { NoAccess, SectionError, SectionLoading } from "@/components/admin/query-state";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { canMoveMoney, canSeeFinance, errMsg, useRole, type PaymentRow } from "@/lib/admin-live";
import { ageLabel, useSocketQuery, type FinanceStats } from "@/lib/admin-stats";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { adminBreadcrumb } from "@/lib/admin-i18n";

const PAY_STATUS_FR: Record<string, string> = { succeeded: "Réussi", pending: "En attente", failed: "Échoué", refunded: "Remboursé" };
const PAY_STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "default"> = { succeeded: "success", pending: "warning", failed: "danger", refunded: "default" };

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const METHOD_LABEL: Record<string, { en: string; fr: string }> = {
  airtel_money: { en: "Airtel Money", fr: "Airtel Money" },
  orange_money: { en: "Orange Money", fr: "Orange Money" },
  vodacom_mpesa: { en: "Vodacom M-Pesa", fr: "Vodacom M-Pesa" },
  stripe_card: { en: "Card", fr: "Carte" },
  wallet: { en: "Wallet", fr: "Portefeuille" },
  cod: { en: "Cash on delivery", fr: "Paiement à la livraison" },
};
function methodLabel(m: string, fr: boolean) {
  const l = METHOD_LABEL[m];
  return l ? (fr ? l.fr : l.en) : m.replace(/_/g, " ");
}

export default function AdminFinancePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const role = useRole();
  const { toast } = useToast();
  const mayDecide = canMoveMoney(role);
  const allowed = canSeeFinance(role);
  const refreshKey = `${rt.payments.length}:${rt.payouts.length}:${rt.orders.length}`;
  const fin = useSocketQuery<FinanceStats>("analytics:finance", undefined, { enabled: allowed, refreshKey });
  const payments = (rt.payments as PaymentRow[]).filter((p) => p.purpose !== "topup");
  const pending = payments.filter((p) => p.status === "pending" && p.method !== "cod");
  const [declineTarget, setDeclineTarget] = useState<PaymentRow | null>(null);
  const [reason, setReason] = useState("");
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmPayment(p: PaymentRow) {
    setBusyRef(p.reference);
    try {
      await socketClient.request("payments:confirm", { reference: p.reference });
      toast(fr ? `Paiement ${p.reference} confirmé` : `Payment ${p.reference} confirmed`, "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusyRef(null);
    }
  }

  async function declinePayment() {
    if (!declineTarget) return;
    setBusyRef(declineTarget.reference);
    setError(null);
    try {
      await socketClient.request("payments:decline", { reference: declineTarget.reference, reason: reason.trim() || undefined });
      toast(fr ? `Paiement ${declineTarget.reference} refusé` : `Payment ${declineTarget.reference} declined`, "success");
      setDeclineTarget(null);
      setReason("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyRef(null);
    }
  }

  const header = (
    <PageHeader
      title={t("finance")}
      subtitle={fr ? "Chiffre d'affaires, commissions, versements, remboursements et créances" : "Revenue, commission, payouts, refunds & receivables"}
      breadcrumbs={[adminBreadcrumb(locale), { label: t("finance") }]}
    />
  );

  // Only finance and admin may read these figures. The server refuses everyone else.
  if (rt.user && !allowed) {
    return (
      <div className="space-y-6">
        {header}
        <NoAccess
          title={fr ? "Réservé à la finance" : "Finance access only"}
          detail={
            fr
              ? "Les chiffres financiers sont réservés aux rôles admin et finance. Le rôle opérations n'y a pas accès."
              : "Financial figures are limited to the admin and finance roles. The operations role cannot open them."
          }
        />
      </div>
    );
  }

  const f = fin.data;
  const gmvSeries = (f?.series30 ?? []).map((d) => ({ date: d.date, value: d.gmv, secondary: d.orders }));
  const collectedSeries = (f?.series30 ?? []).map((d) => ({ date: d.date, value: d.revenue }));
  const refunds30 = (f?.series30 ?? []).reduce((sum, d) => sum + d.refunds, 0);
  const collected30 = (f?.series30 ?? []).reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="space-y-6">
      {header}

      {fin.error && <SectionError message={fin.error} onRetry={fin.reload} />}
      {fin.loading && !f && !fin.error && <SectionLoading />}

      {f && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <StatCard title={fr ? "GMV brut (hors annulées)" : "Gross GMV (excl. cancelled)"} value={formatCurrency(f.grossGmvUsd, locale)} icon={DollarSign} trend={`${fr ? "dont livraison" : "incl. delivery"} ${formatCurrency(f.deliveryFeesUsd, locale)}`} />
            <StatCard title={fr ? "Encaissé" : "Collected"} value={formatCurrency(f.collectedUsd, locale)} icon={Banknote} trend={fr ? "Paiements réussis (COD une fois encaissé)" : "Succeeded payments (COD once collected)"} />
            <StatCard title={fr ? `Commission gagnée (${f.commissionPct} %)` : `Commission earned (${f.commissionPct}%)`} value={formatCurrency(f.commissionEarnedUsd, locale)} icon={Percent} trend={`${fr ? "À venir" : "Expected"} ${formatCurrency(f.commissionExpectedUsd, locale)}`} />
            <StatCard title={fr ? "Remboursements" : "Refunds"} value={formatCurrency(f.refundsUsd, locale)} icon={Receipt} trend={`${f.refundsCount} ${fr ? "paiement(s)" : "payment(s)"}`} />
            <StatCard title={fr ? "Versements payés" : "Payouts paid"} value={formatCurrency(f.payouts.paidUsd, locale)} icon={Wallet} trend={`${f.payouts.paidCount} ${fr ? "versement(s)" : "payout(s)"}`} />
            <StatCard title={fr ? "Versements à payer" : "Payouts owed"} value={formatCurrency(f.payouts.pendingUsd, locale)} icon={PiggyBank} trend={`${f.payouts.requestedCount} ${fr ? "à examiner" : "to review"} · ${f.payouts.pendingCount} ${fr ? "en cours" : "open"}`} />
            <StatCard title={fr ? "Mobile money en attente" : "Mobile money receivable"} value={formatCurrency(f.receivables.amountUsd, locale)} icon={Smartphone} trend={`${f.receivables.count} ${fr ? "paiement(s)" : "payment(s)"}${f.receivables.count ? ` · ${fr ? "plus ancien" : "oldest"} ${ageLabel(f.receivables.oldestMinutes, fr)}` : ""}`} />
            <StatCard title={fr ? "COD à encaisser" : "COD outstanding"} value={formatCurrency(f.codOutstandingUsd, locale)} icon={Truck} trend={`${f.codOutstandingCount} ${fr ? "commande(s)" : "order(s)"}`} />
            <StatCard title={fr ? "Portefeuilles clients (dette)" : "Customer wallet liability"} value={formatCurrency(f.walletLiabilityUsd, locale)} icon={CreditCard} />
            <StatCard title={fr ? "Abonnements vendeurs" : "Seller subscriptions"} value={formatCurrency(f.subscriptionRevenueUsd, locale)} icon={Wallet} />
            <StatCard title={fr ? "Remises promo déduites" : "Promo discounts given"} value={formatCurrency(f.promoDiscountsUsd, locale)} icon={Tag} />
          </div>

          <p className="text-xs text-slate-500">
            {fr
              ? `La commission est de ${f.commissionPct} % de la valeur des articles des commandes livrées (la base des versements vendeurs). Les frais des opérateurs mobile money ne sont pas suivis.`
              : `Commission is ${f.commissionPct}% of the item value of delivered orders (the base seller payouts use). Mobile-money operator fees are not tracked.`}
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title={fr ? "GMV par jour" : "GMV per day"}
              subtitle={fr ? "30 derniers jours (UTC) · points : commandes" : "Last 30 days (UTC) · dots: orders"}
            >
              <DailyBarChart data={gmvSeries} valueLabel="GMV (USD)" secondaryLabel={fr ? "Commandes" : "Orders"} />
            </ChartCard>
            <ChartCard
              title={fr ? "Encaissements par jour" : "Collected per day"}
              subtitle={`${fr ? "30 derniers jours" : "Last 30 days"} · ${formatCurrency(collected30, locale)} · ${fr ? "remboursé" : "refunded"} ${formatCurrency(refunds30, locale)}`}
            >
              <DailyBarChart data={collectedSeries} valueLabel={fr ? "Encaissé (USD)" : "Collected (USD)"} />
            </ChartCard>
          </div>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{fr ? "Créances mobile money" : "Mobile-money receivables"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Débits en attente de l'abonné ou de la finance" : "Charges waiting for the subscriber or finance"}</p>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  emptyMessage={fr ? "Aucune créance" : "Nothing outstanding"}
                  columns={[
                    { key: "method", label: fr ? "Réseau" : "Network", render: (row) => methodLabel(String(row.method), fr) },
                    { key: "count", label: fr ? "Nb" : "Count" },
                    { key: "amountUsd", label: t("amount"), render: (row) => formatCurrency(Number(row.amountUsd), locale) },
                    { key: "oldestMinutes", label: fr ? "Plus ancien" : "Oldest", render: (row) => ageLabel(Number(row.oldestMinutes), fr) },
                  ]}
                  data={f.receivables.byMethod as unknown as Record<string, unknown>[]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
                  {fr ? "Paiements récents" : "Recent payments"}
                </h2>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  emptyMessage={fr ? "Aucun paiement" : "No payments yet"}
                  columns={[
                    { key: "reference", label: t("transaction") },
                    { key: "orderReference", label: fr ? "Objet" : "For", render: (row) => <PaymentSubject row={row as unknown as PaymentRow} fr={fr} /> },
                    { key: "method", label: t("type"), render: (row) => <span>{methodLabel(String(row.method), fr)}</span> },
                    { key: "amountUsd", label: t("amount"), render: (row) => <span className={row.status === "refunded" ? "text-red-600" : "text-emerald-600"}>{formatCurrency(Number(row.amountUsd), locale)}</span> },
                    { key: "status", label: t("status"), render: (row) => (
                      <Badge variant={PAY_STATUS_VARIANT[String(row.status)] ?? "default"}>{fr ? (PAY_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>
                    )},
                    { key: "createdAt", label: t("date"), render: (row) => <span>{String(row.createdAt).slice(0, 10)}</span> },
                  ]}
                  data={payments.slice(0, 15) as unknown as Record<string, unknown>[]}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
            {fr ? "Paiements mobile money en attente" : "Pending mobile-money payments"}
          </h2>
          <p className="text-xs text-slate-500">
            {fr
              ? "Confirmez ou refusez à la main un paiement que l'opérateur n'a pas encore réglé."
              : "Settle by hand a payment the operator has not confirmed yet."}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun paiement en attente" : "No pending mobile-money payments"}
            columns={[
              { key: "reference", label: fr ? "Référence" : "Reference" },
              { key: "orderReference", label: fr ? "Objet" : "For", render: (row) => <PaymentSubject row={row as unknown as PaymentRow} fr={fr} /> },
              { key: "method", label: fr ? "Méthode" : "Method", render: (row) => <span>{methodLabel(String(row.method), fr)}</span> },
              { key: "amountUsd", label: t("amount"), render: (row) => formatCurrency(Number(row.amountUsd), locale) },
              { key: "createdAt", label: t("date"), render: (row) => <span>{String(row.createdAt).slice(0, 16).replace("T", " ")}</span> },
              {
                key: "actions",
                label: t("action"),
                render: (row) => {
                  const p = row as unknown as PaymentRow;
                  if (!mayDecide) return <span className="text-sm text-slate-400">—</span>;
                  return (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="approve" size="sm" disabled={busyRef === p.reference} onClick={() => confirmPayment(p)}>
                        {fr ? "Confirmer" : "Confirm"}
                      </Button>
                      <Button variant="reject" size="sm" disabled={busyRef === p.reference} onClick={() => { setDeclineTarget(p); setReason(""); setError(null); }}>
                        {fr ? "Refuser" : "Decline"}
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            data={pending as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <Modal
        open={!!declineTarget}
        onClose={() => busyRef === null && setDeclineTarget(null)}
        title={fr ? "Refuser le paiement" : "Decline payment"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeclineTarget(null)} disabled={busyRef !== null}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={declinePayment} disabled={busyRef !== null}>{busyRef ? "…" : fr ? "Refuser" : "Decline"}</Button>
          </>
        }
      >
        {declineTarget && (
          <>
            <p>{declineTarget.reference} · {declineTarget.orderReference} · {formatCurrency(declineTarget.amountUsd, locale)}</p>
            <label className="block text-xs font-medium text-slate-500">
              {fr ? "Motif" : "Reason"}
              <input className="input-premium mt-1 w-full px-4 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <ErrorNote message={error} />
          </>
        )}
      </Modal>
    </div>
  );
}

function PaymentSubject({ row, fr }: { row: PaymentRow; fr: boolean }) {
  if (row.purpose === "plan") return <span>{fr ? "Abonnement" : "Plan"} {row.subject ?? ""}</span>;
  if (row.orderId) return <Link href={`/admin/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">{String(row.orderReference)}</Link>;
  return <span>{fr ? "Recharge" : "Top-up"}</span>;
}
