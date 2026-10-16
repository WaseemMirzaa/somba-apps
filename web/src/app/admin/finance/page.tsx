"use client";

import { DollarSign, TrendingUp, Wallet, CreditCard, Percent, Scale, Receipt, Banknote } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  DualMetricChart,
  SegmentDonut,
  FunnelChart,
  HorizontalBarChart,
} from "@/components/charts/dashboard-charts";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { DemoBadge } from "@/components/admin/demo-badge";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { canMoveMoney, errMsg, useRole, type PaymentRow } from "@/lib/admin-live";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import {
  financeKpis,
  revenueVsPayouts,
  commissionByCategory,
  paymentMethodSplit,
  settlementAging,
  cashFlowStages,
  refundReasons,
} from "@/lib/finance-analytics";

const PAY_STATUS_FR: Record<string, string> = { succeeded: "Réussi", pending: "En attente", failed: "Échoué", refunded: "Remboursé" };
const PAY_STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "default"> = { succeeded: "success", pending: "warning", failed: "danger", refunded: "default" };

function ChartCard({ title, subtitle, children, className, fr }: { title: string; subtitle?: string; children: React.ReactNode; className?: string; fr?: boolean }) {
  return (
    <Card className={className}>
      <CardHeader>
        <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
          {title}
          <DemoBadge fr={fr} />
        </h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function AdminFinancePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const k = financeKpis;
  const rt = useRealtime();
  const role = useRole();
  const { toast } = useToast();
  const mayDecide = canMoveMoney(role);
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

  const commissionSegments = commissionByCategory.map((c) => ({ label: fr ? c.labelFr : c.label, pct: c.pct, color: c.color }));
  const paymentSegments = paymentMethodSplit.map((c) => ({ label: fr ? c.labelFr : c.label, pct: c.pct, color: c.color }));
  const agingItems = settlementAging.map((b) => ({ name: fr ? b.bucketFr : b.bucket, amount: b.amount }));
  const reasonItems = refundReasons.map((r) => ({ name: fr ? r.reasonFr : r.reason, count: r.count }));
  const funnelStages = cashFlowStages.map((s) => ({ stage: fr ? s.stageFr : s.stage, count: s.count, pct: s.pct }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("finance")}
        subtitle={fr ? "Chiffre d'affaires, commissions, versements, remboursements et règlements" : "Revenue, commission, payouts, refunds & settlements"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("finance") }]}
      />

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {fr ? "Indicateurs" : "Indicators"}
        <DemoBadge fr={fr} />
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={fr ? "Chiffre brut" : "Gross revenue"} value={formatCurrency(k.grossRevenue, locale)} icon={DollarSign} trend={`+${k.grossChange}% ${fr ? "cette semaine" : "this week"}`} />
        <StatCard title={fr ? "Revenu net" : "Net revenue"} value={formatCurrency(k.netRevenue, locale)} icon={TrendingUp} trend={`+${k.netChange}%`} />
        <StatCard title={fr ? "Commissions" : "Commission earned"} value={formatCurrency(k.commissionEarned, locale)} icon={Percent} trend={`+${k.commissionChange}%`} />
        <StatCard title={fr ? "Versements en attente" : "Pending payouts"} value={formatCurrency(k.pendingPayouts, locale)} icon={Wallet} />
        <StatCard title={fr ? "Remboursements (MTD)" : "Refunds (MTD)"} value={formatCurrency(k.refundsMtd, locale)} icon={Receipt} />
        <StatCard title={fr ? "Paiements en souffrance" : "Outstanding"} value={formatCurrency(k.outstanding, locale)} icon={CreditCard} />
        <StatCard title={fr ? "Retenue fiscale" : "Tax withheld"} value={formatCurrency(k.taxWithheld, locale)} icon={Banknote} />
        <StatCard title={fr ? "Gel litiges" : "Dispute hold"} value={formatCurrency(k.disputeHold, locale)} icon={Scale} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          fr={fr}
          className="lg:col-span-2"
          title={fr ? "Chiffre d'affaires vs versements" : "Revenue vs payouts"}
          subtitle={fr ? "Barres : chiffre brut · Ligne : versements vendeurs (8 semaines)" : "Bars: gross revenue · Line: seller payouts (8 weeks)"}
        >
          <DualMetricChart data={revenueVsPayouts} height={240} />
        </ChartCard>

        <ChartCard fr={fr} title={fr ? "Commissions par catégorie" : "Commission by category"} subtitle={fr ? "Part des commissions" : "Share of commission earned"}>
          <SegmentDonut segments={commissionSegments} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard fr={fr} title={fr ? "Flux de trésorerie" : "Cash flow"} subtitle={fr ? "Du brut au net plateforme" : "Gross → net to platform"}>
          <FunnelChart stages={funnelStages} />
        </ChartCard>

        <ChartCard fr={fr} title={fr ? "Modes de paiement" : "Payment methods"} subtitle={fr ? "Part du volume encaissé" : "Share of collected volume"}>
          <SegmentDonut segments={paymentSegments} />
        </ChartCard>

        <ChartCard fr={fr} title={fr ? "Ancienneté des règlements" : "Settlement aging"} subtitle={fr ? "Versements en attente par cohorte" : "Pending payouts by age"}>
          <HorizontalBarChart
            items={agingItems}
            valueKey="amount"
            labelKey="name"
            formatValue={(v) => formatCurrency(v, locale)}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-1" title={fr ? "Motifs de remboursement" : "Top refund reasons"} subtitle={fr ? "Nombre ce mois-ci" : "Count this month"}>
          <HorizontalBarChart items={reasonItems} valueKey="count" labelKey="name" formatValue={(v) => String(v)} />
        </ChartCard>

        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
              {fr ? "Paiements récents (en direct)" : "Recent payments (live)"}
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun paiement" : "No payments yet"}
              columns={[
                { key: "reference", label: t("transaction") },
                {
                  key: "orderReference",
                  label: fr ? "Commande" : "Order",
                  render: (row) => row.orderId ? <Link href={`/admin/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">{String(row.orderReference)}</Link> : <span>{fr ? "Recharge" : "Top-up"}</span>,
                },
                { key: "method", label: t("type"), render: (row) => <span>{String(row.method).replace(/_/g, " ")}</span> },
                { key: "amountUsd", label: t("amount"), render: (row) => <span className={row.status === "refunded" ? "text-red-600" : "text-emerald-600"}>{formatCurrency(Number(row.amountUsd), locale)}</span> },
                { key: "status", label: t("status"), render: (row) => (
                  <Badge variant={PAY_STATUS_VARIANT[String(row.status)] ?? "default"}>{fr ? (PAY_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>
                )},
                { key: "createdAt", label: t("date"), render: (row) => <span>{String(row.createdAt).slice(0, 10)}</span> },
              ]}
              data={(rt.payments as PaymentRow[]).slice(0, 15) as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      </div>

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
              {
                key: "orderReference",
                label: fr ? "Commande" : "Order",
                render: (row) => row.orderId ? <Link href={`/admin/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">{String(row.orderReference)}</Link> : <span>{fr ? "Recharge" : "Top-up"}</span>,
              },
              { key: "method", label: fr ? "Méthode" : "Method", render: (row) => <span>{String(row.method).replace(/_/g, " ")}</span> },
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
