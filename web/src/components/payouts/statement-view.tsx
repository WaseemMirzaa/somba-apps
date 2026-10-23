"use client";

import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSocketQuery } from "@/lib/admin-stats";
import { localDay } from "@/lib/dates";
import { statementCsvRows, statementFilename, type PayoutStatementData, type StatementLine } from "@/lib/payout-statement";
import { downloadCsv, payoutMethodLabel } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

/**
 * The settlement statement of one payout: opening balance, the sale lines it settles (order, product,
 * quantity, gross, the commission rate stored when the order was placed, commission, net, delivery date),
 * refund lines clawed back from earlier statements, totals, closing balance, and a CSV download.
 * Used by the seller's payout page and the admin payouts drawer. Read-only: the server builds it when
 * the payout is requested.
 */
export function PayoutStatement({ payoutId }: { payoutId: string }) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const q = useSocketQuery<PayoutStatementData>("payouts:statement", { payoutId });

  if (q.error && !q.data) return <SectionError message={q.error} onRetry={() => void q.reload()} />;
  if (!q.data) return <SectionLoading />;
  const { payout, lines, totals, legacy } = q.data;
  const money = (n: number) => formatCurrency(n, locale);

  function download() {
    downloadCsv(statementFilename(q.data!), statementCsvRows(q.data!, { fr, day: localDay, method: (m) => payoutMethodLabel(m, fr) }));
    toast(fr ? "Relevé CSV téléchargé" : "Statement CSV downloaded");
  }

  if (legacy || !totals) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {fr
            ? "Ce versement a été émis avant l'existence des relevés détaillés : aucune ligne n'est disponible."
            : "This payout was issued before detailed statements existed: there are no lines to show."}
        </p>
        <Button size="sm" variant="secondary" onClick={download}>
          <Download className="h-3.5 w-3.5" />
          {fr ? "Télécharger CSV" : "Download CSV"}
        </Button>
      </div>
    );
  }

  const summary: { label: string; value: string; strong?: boolean }[] = [
    { label: fr ? "Solde d'ouverture" : "Opening balance", value: money(totals.openingBalanceUsd) },
    { label: fr ? "Ventes brutes" : "Gross sales", value: money(totals.grossUsd) },
    { label: "Commission", value: `− ${money(totals.commissionUsd)}` },
    { label: fr ? "Remboursements" : "Refunds", value: `− ${money(totals.refundsUsd)}` },
    { label: fr ? "Net de ce relevé" : "Statement net", value: money(totals.netUsd), strong: true },
    { label: fr ? "Montant du versement" : "Payout amount", value: money(totals.amountUsd) },
    { label: fr ? "Solde de clôture" : "Closing balance", value: money(totals.closingBalanceUsd), strong: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {fr
            ? "Chaque ligne garde la commission enregistrée à la création de la commande ; un changement de taux ne la modifie jamais."
            : "Each line keeps the commission stored when its order was placed; a later rate change never alters it."}
        </p>
        <Button size="sm" variant="secondary" onClick={download}>
          <Download className="h-3.5 w-3.5" />
          {fr ? "Télécharger CSV" : "Download CSV"}
        </Button>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-white p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{s.label}</dt>
            <dd className={`mt-1 text-sm ${s.strong ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {lines.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {fr
            ? `Aucune nouvelle vente sur ce relevé : le versement est prélevé sur le solde reporté (${payout.reference}).`
            : `No new sales on this statement: the payout draws on the balance carried forward (${payout.reference}).`}
        </p>
      ) : (
        <DataTable
          columns={[
            { key: "orderReference", label: fr ? "Commande" : "Order", primary: true, render: (r) => <span className="font-medium text-slate-900">{String(r.orderReference)}</span> },
            {
              key: "productName",
              label: fr ? "Produit" : "Product",
              render: (r) => {
                const l = r as unknown as StatementLine;
                return (
                  <span>
                    {l.productName}
                    {l.variant && l.variant !== "Default" ? <span className="block text-xs text-slate-400">{l.variant}</span> : null}
                    {l.kind === "refund" ? (
                      <Badge variant="danger" className="mt-1">
                        {fr ? "Remboursement" : "Refund"}
                      </Badge>
                    ) : null}
                  </span>
                );
              },
            },
            { key: "qty", label: fr ? "Qté" : "Qty" },
            { key: "grossUsd", label: fr ? "Brut" : "Gross", render: (r) => money(r.grossUsd as number) },
            { key: "commissionPct", label: fr ? "Taux" : "Rate", render: (r) => `${r.commissionPct as number}%` },
            { key: "commissionUsd", label: "Commission", render: (r) => money(r.commissionUsd as number) },
            { key: "refundUsd", label: fr ? "Remb." : "Refund", render: (r) => ((r.refundUsd as number) > 0 ? money(r.refundUsd as number) : "—") },
            { key: "netUsd", label: "Net", render: (r) => <span className="font-semibold">{money(r.netUsd as number)}</span> },
            { key: "deliveredAt", label: fr ? "Livrée le" : "Delivered", render: (r) => localDay(r.deliveredAt as string | null) || "—" },
          ]}
          data={lines as unknown as Record<string, unknown>[]}
        />
      )}

      <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 border-t border-[var(--border)] pt-3 text-sm">
        <span className="text-slate-500">
          {fr ? "Totaux" : "Totals"} · {fr ? "Brut" : "Gross"} <strong className="text-slate-900">{money(totals.grossUsd)}</strong>
        </span>
        <span className="text-slate-500">
          Commission <strong className="text-slate-900">{money(totals.commissionUsd)}</strong>
        </span>
        <span className="text-slate-500">
          {fr ? "Remboursements" : "Refunds"} <strong className="text-slate-900">{money(totals.refundsUsd)}</strong>
        </span>
        <span className="text-slate-500">
          Net <strong className="text-slate-900">{money(totals.netUsd)}</strong>
        </span>
      </div>
    </div>
  );
}
