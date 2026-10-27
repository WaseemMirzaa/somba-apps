"use client";

import Link from "next/link";
import { Wallet, RotateCcw, Percent, Clock, CheckCircle2, Truck } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { DetailSection } from "@/components/ui/info-grid";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { RevenueAreaChart, HorizontalBarChart } from "@/components/charts/dashboard-charts";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { FinanceEarnings } from "@/components/seller/finance-earnings";
import { FinanceRules } from "@/components/seller/finance-rules";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { countdownText, useNow } from "@/lib/seller-api";
import {
  txnKindLabel,
  txnKindVariant,
  useEarnings,
  useFinanceBalance,
  useStatementMonths,
  useTransactions,
} from "@/lib/seller-finance";
import { payoutMethodLabel, payoutStatusLabel, payoutStatusVariant } from "@/lib/seller-labels";
import { localDay } from "@/lib/dates";
import { formatCurrency } from "@/lib/utils";
import { localized } from "@/lib/i18n-fields";

export default function SellerFinancePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { payoutList, categoryRevenue } = useSellerData();
  const balance = useFinanceBalance();
  const totalsQuery = useEarnings({ limit: 1 });
  const months = useStatementMonths();
  const txns = useTransactions({ limit: 8 });
  const now = useNow(30_000);

  const b = balance.data;
  const totals = totalsQuery.data?.totals;
  const money = (n: number) => formatCurrency(n, locale);
  const next = b?.nextClearanceAt ? countdownText(b.nextClearanceAt, now, fr) : null;

  const revenueTrendData = [...(months.data?.months ?? [])]
    .reverse()
    .map((d) => ({ label: d.month, revenue: d.grossUsd, net: d.netUsd }));
  const categoryChartData = categoryRevenue.map((c) => ({ name: fr ? c.categoryFr : c.category, revenue: c.net }));
  const recentPayouts = payoutList.slice(0, 5);
  const error = balance.error || totalsQuery.error;

  const navLinks = [
    { href: "/seller/finance/payouts/pending", label: fr ? "Gains par commande" : "Earnings per order" },
    { href: "/seller/finance/transactions", label: "Transactions" },
    { href: "/seller/finance/payouts", label: t("payouts") },
    { href: "/seller/finance/statements", label: fr ? "Relevés" : "Statements" },
    { href: "/seller/finance/tax", label: fr ? "Documents fiscaux" : "Tax documents" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("finance")}
        subtitle={
          fr
            ? "Disponible · En délai de sécurité · En cours · Versé · Commission · Remboursements"
            : "Available · Clearing · In progress · Paid out · Commission · Refunds"
        }
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("finance") }]}
        actions={
          <Link href="/seller/finance/payouts/request" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
            {t("requestPayout")}
          </Link>
        }
      />

      {error && <LoadError message={error} onRetry={async () => { await balance.reload(); await totalsQuery.reload(); }} />}

      <FinanceRules balance={b} />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {fr
          ? "Un gain n'est retirable qu'une fois la commande livrée et le délai de sécurité écoulé, commission de la commande déduite. Les chiffres viennent du serveur et se mettent à jour en direct."
          : "Earnings can be withdrawn once the order is delivered and the clearance hold has passed, minus the order's commission. These figures come from the server and update live."}
      </div>

      {balance.loading && !b ? (
        <SectionLoader />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" data-testid="finance-cards">
          <StatCard title={t("availableBalance")} value={money(b?.available ?? 0)} icon={Wallet} trend={b && b.available < b.minPayoutUsd ? (fr ? `Minimum de versement : ${money(b.minPayoutUsd)}` : `Minimum payout: ${money(b.minPayoutUsd)}`) : undefined} />
          <StatCard
            title={fr ? "En délai de sécurité" : "Clearing"}
            value={money(b?.clearingUsd ?? 0)}
            icon={Clock}
            trend={next && (b?.clearingUsd ?? 0) > 0 ? (fr ? `Prochain déblocage : ${next.text.replace("Reste ", "dans ")}` : `Next clears: ${next.text}`) : undefined}
          />
          <StatCard title={fr ? "En cours de livraison (net)" : "In delivery (net)"} value={money(b?.inProgressUsd ?? 0)} icon={Truck} />
          <StatCard title={fr ? "Déjà versé" : "Paid out"} value={money(totals?.paidOutUsd ?? 0)} icon={CheckCircle2} />
          <StatCard title={fr ? "Commission payée" : "Commission paid"} value={money(b?.commissionUsd ?? 0)} icon={Percent} />
          <StatCard title={fr ? "Retours (ventes annulées)" : "Returned (sales taken back)"} value={money(totals?.returnedUsd ?? 0)} icon={RotateCcw} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold text-slate-900">{fr ? "Tendance des revenus" : "Revenue Trend"}</h3>
            <NavLinkButton href="/seller/finance/statements">{fr ? "Voir les relevés" : "View statements"} →</NavLinkButton>
          </CardHeader>
          <CardContent>
            {months.loading ? <SectionLoader /> : <RevenueAreaChart data={revenueTrendData} valueKey="revenue" height={200} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold text-slate-900">{fr ? "Revenus par catégorie" : "Revenue by Category"}</h3>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart items={categoryChartData} valueKey="revenue" labelKey="name" formatValue={(v) => formatCurrency(v, locale)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <h3 className="font-semibold text-slate-900">{fr ? "Transactions récentes" : "Recent Transactions"}</h3>
          <NavLinkButton href="/seller/finance/transactions">{fr ? "Toutes les transactions" : "All transactions"} →</NavLinkButton>
        </CardHeader>
        <CardContent className="p-0">
          {txns.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Aucune transaction pour le moment." : "No transactions yet."}
              columns={[
                { key: "reference", label: fr ? "Référence" : "Reference", render: (row) => String(row.reference) },
                { key: "description", label: fr ? "Détail" : "Description", render: (row) => localized(row, "description", fr) },
                { key: "kind", label: "Type", render: (row) => <Badge variant={txnKindVariant(String(row.kind))}>{txnKindLabel(String(row.kind), fr)}</Badge> },
                { key: "grossUsd", label: fr ? "Brut" : "Gross", render: (row) => (row.kind === "payout" ? "—" : money(row.grossUsd as number)) },
                { key: "commissionUsd", label: "Commission", render: (row) => (row.kind === "payout" ? "—" : money(row.commissionUsd as number)) },
                { key: "amountUsd", label: fr ? "Montant" : "Amount", render: (row) => <strong className={(row.amountUsd as number) < 0 ? "text-red-600" : ""}>{money(row.amountUsd as number)}</strong> },
                { key: "at", label: t("date"), render: (row) => localDay(row.at as string) },
              ]}
              data={(txns.data?.items ?? []) as unknown as Record<string, unknown>[]}
            />
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{fr ? "Gains par commande" : "Earnings per order"}</h3>
          <NavLinkButton href="/seller/finance/payouts/pending">{fr ? "Voir détail" : "View breakdown"} →</NavLinkButton>
        </div>
        <FinanceEarnings compact />
      </div>

      <div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h3 className="font-semibold text-slate-900">{fr ? "Derniers versements" : "Recent Payouts"}</h3>
            <NavLinkButton href="/seller/finance/payouts">{fr ? "Tous les versements" : "All payouts"} →</NavLinkButton>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun versement demandé." : "No payouts requested yet."}
              columns={[
                {
                  key: "id",
                  label: fr ? "Référence" : "Request ID",
                  render: (row) => (
                    <Link href={`/seller/finance/payouts/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.id)}
                    </Link>
                  ),
                },
                { key: "amount", label: t("amount"), render: (row) => money(row.amount as number) },
                { key: "methodKey", label: fr ? "Méthode" : "Method", render: (row) => payoutMethodLabel(String(row.methodKey), fr) },
                { key: "status", label: t("status"), render: (row) => <Badge variant={payoutStatusVariant(String(row.status))}>{payoutStatusLabel(String(row.status), fr)}</Badge> },
                { key: "date", label: t("date") },
              ]}
              data={recentPayouts as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <h3 className="font-semibold text-slate-900">Commission</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            {fr
              ? `La plateforme prélève ${b?.commissionPct ?? "—"} % sur les nouvelles commandes ; chaque commande garde le taux enregistré à sa création, un changement de taux ne modifie jamais vos commandes passées. Commission sur vos ventes à ce jour : ${money(b?.commissionUsd ?? 0)}. Le détail de chaque mois figure sur une facture de commission (Documents fiscaux).`
              : `The platform keeps ${b?.commissionPct ?? "—"}% on new orders; each order keeps the rate stored when it was placed, so a rate change never alters your past orders. Commission on your sales so far: ${money(b?.commissionUsd ?? 0)}. Each month's detail is on a commission invoice (Tax documents).`}
          </p>
        </CardContent>
      </Card>

      <DetailSection title={fr ? "Navigation finance" : "Finance Navigation"}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-lg border border-[var(--primary-tint)] p-4 text-center font-medium text-[var(--primary)] hover:bg-[var(--primary-light)]">
              {link.label} →
            </Link>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}
