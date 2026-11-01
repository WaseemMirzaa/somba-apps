"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { localDay } from "@/lib/dates";
import { sellerRequest } from "@/lib/seller-api";
import { monthLabel, saveCsvText, useStatementMonth, useStatementMonths } from "@/lib/seller-finance";
import { errMessage, payoutMethodLabel, payoutStatusLabel, payoutStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { localized } from "@/lib/i18n-fields";

/** Monthly statements built by the server (sales dated at delivery, refunds dated at return), with CSV per month. */
export default function SellerStatementsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const months = useStatementMonths();
  const [open, setOpen] = useState<string | null>(null);
  const detail = useStatementMonth(open);
  const [busy, setBusy] = useState<string | null>(null);
  const money = (n: number) => formatCurrency(n, locale);

  const rows = months.data?.months ?? [];
  const visible = rows.filter((m) => m.orders > 0 || m.refundsUsd > 0 || m.netUsd !== 0);

  async function download(month: string) {
    setBusy(month);
    try {
      const res = await sellerRequest<{ filename: string; csv: string }>("finance:statements", { month, format: "csv" });
      saveCsvText(res.filename, res.csv);
      toast(fr ? "Relevé CSV téléchargé" : "Statement CSV downloaded");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const d = detail.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Relevés" : "Statements"}
        subtitle={
          fr
            ? "Relevé mensuel établi par le serveur : ventes à la date de livraison, remboursements à la date de retour, commission enregistrée à chaque commande"
            : "Monthly statement built by the server: sales on their delivery date, refunds on their return date, the commission stored on each order"
        }
        backHref="/seller/finance"
      />
      {months.error && <LoadError message={months.error} onRetry={months.reload} />}
      <DetailSection title={fr ? "Relevés disponibles (12 derniers mois)" : "Available statements (last 12 months)"}>
        {months.loading ? (
          <SectionLoader />
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">{fr ? "Aucune commande livrée ni remboursement pour le moment." : "No delivered orders or refunds yet."}</p>
        ) : (
          <DataTable
            columns={[
              { key: "month", label: fr ? "Mois" : "Month", render: (row) => monthLabel(String(row.month), locale) },
              { key: "orders", label: fr ? "Commandes" : "Orders" },
              { key: "units", label: fr ? "Unités" : "Units" },
              { key: "grossUsd", label: fr ? "Brut" : "Gross", render: (row) => money(row.grossUsd as number) },
              { key: "commissionUsd", label: "Commission", render: (row) => money(row.commissionUsd as number) },
              { key: "refundsUsd", label: fr ? "Remboursements" : "Refunds", render: (row) => money(row.refundsUsd as number) },
              { key: "netUsd", label: "Net", render: (row) => <strong>{money(row.netUsd as number)}</strong> },
              {
                key: "actions",
                label: fr ? "Action" : "Action",
                render: (row) => (
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => setOpen(open === row.month ? null : String(row.month))} className="text-sm text-[var(--primary)] hover:underline">
                      {open === row.month ? (fr ? "Masquer" : "Hide") : fr ? "Voir le détail" : "View lines"}
                    </button>
                    <button type="button" disabled={busy === row.month} onClick={() => void download(String(row.month))} className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline disabled:opacity-50">
                      <Download className="h-3.5 w-3.5" />
                      {busy === row.month ? "…" : fr ? "Télécharger CSV" : "Download CSV"}
                    </button>
                  </div>
                ),
              },
            ]}
            data={visible as unknown as Record<string, unknown>[]}
          />
        )}
      </DetailSection>

      {open && (
        <DetailSection title={`${fr ? "Détail" : "Detail"} · ${monthLabel(open, locale)}`}>
          {detail.error && <LoadError message={detail.error} onRetry={detail.reload} />}
          {detail.loading || !d || d.month !== open ? (
            <SectionLoader />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6" data-testid="statement-totals">
                {[
                  { l: fr ? "Commandes" : "Orders", v: String(d.totals.orders) },
                  { l: fr ? "Brut" : "Gross", v: money(d.totals.grossUsd) },
                  { l: "Commission", v: `− ${money(d.totals.commissionUsd)}` },
                  { l: fr ? "Remboursements" : "Refunds", v: `− ${money(d.totals.refundsUsd)}` },
                  { l: fr ? "Commission recréditée" : "Commission credited back", v: money(d.totals.commissionCreditedUsd) },
                  { l: fr ? "Net du mois" : "Month net", v: money(d.totals.netUsd) },
                  { l: fr ? "Versements demandés" : "Payouts requested", v: money(d.totals.payoutsRequestedUsd) },
                  { l: fr ? "Versements payés" : "Payouts paid", v: money(d.totals.payoutsPaidUsd) },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{x.l}</p>
                    <p className="mt-1 break-words text-base font-bold text-slate-900">{x.v}</p>
                  </div>
                ))}
              </div>
              <DataTable
                emptyMessage={fr ? "Aucune ligne ce mois-ci." : "No lines this month."}
                columns={[
                  { key: "date", label: fr ? "Date" : "Date", render: (row) => localDay(row.date as string) },
                  { key: "kind", label: "Type", render: (row) => <Badge variant={row.kind === "refund" ? "danger" : "success"}>{row.kind === "refund" ? (fr ? "Remboursement" : "Refund") : fr ? "Vente" : "Sale"}</Badge> },
                  { key: "orderReference", label: fr ? "Commande" : "Order" },
                  { key: "productName", label: fr ? "Produit" : "Product", render: (row) => `${localized(row, "productName", fr)}${row.variant && row.variant !== "Default" ? ` · ${localized(row, "variant", fr)}` : ""} × ${row.qty}` },
                  { key: "grossUsd", label: fr ? "Brut" : "Gross", render: (row) => money(row.grossUsd as number) },
                  { key: "commissionUsd", label: "Commission", render: (row) => `${money(row.commissionUsd as number)} (${row.commissionPct} %)` },
                  { key: "netUsd", label: "Net", render: (row) => <strong className={(row.netUsd as number) < 0 ? "text-red-600" : ""}>{money(row.netUsd as number)}</strong> },
                ]}
                data={d.lines as unknown as Record<string, unknown>[]}
              />
              {d.payouts.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-800">{fr ? "Versements du mois" : "Payouts this month"}</h4>
                  <DataTable
                    columns={[
                      { key: "reference", label: fr ? "Référence" : "Reference" },
                      { key: "amountUsd", label: fr ? "Montant" : "Amount", render: (row) => money(row.amountUsd as number) },
                      { key: "method", label: fr ? "Méthode" : "Method", render: (row) => payoutMethodLabel(String(row.method), fr) },
                      { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={payoutStatusVariant(String(row.status))}>{payoutStatusLabel(String(row.status), fr)}</Badge> },
                      { key: "createdAt", label: "Date", render: (row) => localDay(row.createdAt as string) },
                    ]}
                    data={d.payouts as unknown as Record<string, unknown>[]}
                  />
                </div>
              )}
            </div>
          )}
        </DetailSection>
      )}
    </div>
  );
}
