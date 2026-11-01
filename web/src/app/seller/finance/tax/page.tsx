"use client";

import { useState } from "react";
import { FileText, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerRequest } from "@/lib/seller-api";
import { monthLabel, useFinanceBalance, useTaxDocuments, type TaxDocument } from "@/lib/seller-finance";
import { errMessage } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

/** Commission invoices: one PDF per month, issued by the platform in the seller's language. */
export default function SellerTaxPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const docs = useTaxDocuments(year);
  const balance = useFinanceBalance();
  const [busy, setBusy] = useState<string | null>(null);
  const money = (n: number) => formatCurrency(n, locale);
  const lang: "en" | "fr" = fr ? "fr" : "en";

  async function issue(period: string, hadDoc: boolean) {
    setBusy(period);
    let tab: Window | null = null;
    try {
      // Open the tab first (a click is the only moment a pop-up is allowed), then point it at the PDF.
      tab = window.open("", "_blank");
      const doc = await sellerRequest<TaxDocument>("finance:taxDocument", { period, locale: lang });
      if (tab) tab.location.href = doc.url;
      else window.location.href = doc.url;
      await docs.reload();
      toast(hadDoc ? (fr ? "Facture ouverte" : "Invoice opened") : fr ? `Facture ${doc.number} générée` : `Invoice ${doc.number} issued`);
    } catch (e) {
      tab?.close();
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const months = docs.data?.months ?? [];
  const items = docs.data?.items ?? [];
  const numberOf = (documentId: string | null) => items.find((d) => d.id === documentId);
  const years = [thisYear, thisYear - 1, thisYear - 2];
  const anySales = months.some((m) => m.hasSales);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Documents fiscaux" : "Tax documents"}
        subtitle={fr ? "Factures de commission mensuelles émises par Somba (PDF)" : "Monthly commission invoices issued by Somba (PDF)"}
        backHref="/seller/finance"
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            {fr ? "Année" : "Year"}
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-premium px-3 py-2 text-sm" aria-label={fr ? "Année" : "Year"}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        {fr
          ? `Chaque facture récapitule vos commandes livrées du mois, la commission prélevée (${balance.data ? `${balance.data.commissionPct} % sur les nouvelles commandes` : "taux enregistré par commande"}), les commissions recréditées et le net. Un mois terminé est figé une fois émis ; le mois en cours est recalculé à chaque ouverture.`
          : `Each invoice summarises the month's delivered orders, the commission charged (${balance.data ? `${balance.data.commissionPct}% on new orders` : "the rate stored per order"}), commission credited back and the net. A finished month is frozen once issued; the current month is rebuilt each time you open it.`}
      </div>

      {docs.error && <LoadError message={docs.error} onRetry={docs.reload} />}

      <DetailSection title={fr ? `Factures de commission ${year}` : `Commission invoices ${year}`}>
        {docs.loading ? (
          <SectionLoader />
        ) : !anySales ? (
          <p className="text-sm text-slate-500">
            {fr ? `Aucune vente livrée en ${year} : rien à facturer.` : `No delivered sales in ${year}: nothing to invoice.`}
          </p>
        ) : (
          <DataTable
            columns={[
              { key: "month", label: fr ? "Mois" : "Month", render: (row) => monthLabel(String(row.month), locale) },
              { key: "orders", label: fr ? "Commandes" : "Orders" },
              { key: "commissionUsd", label: "Commission", render: (row) => money(row.commissionUsd as number) },
              {
                key: "document",
                label: fr ? "Facture" : "Invoice",
                render: (row) => {
                  const d = numberOf(row.documentId as string | null);
                  if (!row.hasSales) return <span className="text-slate-400">{fr ? "Pas de ventes" : "No sales"}</span>;
                  return row.url ? (
                    <Badge variant="success">{d ? d.number : fr ? "Émise" : "Issued"}</Badge>
                  ) : (
                    <Badge variant="warning">{fr ? "Pas encore émise" : "Not issued yet"}</Badge>
                  );
                },
              },
              {
                key: "actions",
                label: "Action",
                render: (row) => {
                  if (!row.hasSales) return "—";
                  const period = String(row.month);
                  const issued = !!row.url;
                  const live = busy === period;
                  return (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={live}
                        onClick={() => void issue(period, issued)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-1.5 text-sm text-[var(--primary)] hover:bg-sky-50 disabled:opacity-50"
                      >
                        {live ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                        {issued ? (fr ? "Ouvrir le PDF" : "Open PDF") : fr ? "Générer la facture" : "Generate invoice"}
                      </button>
                      {issued && typeof row.url === "string" && (
                        <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:underline">
                          <RefreshCw className="hidden h-3 w-3" />
                          {fr ? "Lien direct" : "Direct link"}
                        </a>
                      )}
                    </div>
                  );
                },
              },
            ]}
            data={months.filter((m) => m.hasSales || m.documentId) as unknown as Record<string, unknown>[]}
          />
        )}
      </DetailSection>
    </div>
  );
}
