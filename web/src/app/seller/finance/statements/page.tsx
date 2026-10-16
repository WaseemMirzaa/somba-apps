"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { downloadCsv } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

export default function SellerStatementsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { statements, sellerStore, commissionPct } = useSellerData();

  function monthLabel(month: string) {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  }

  function csvFor(rows: typeof statements, filename: string) {
    downloadCsv(filename, [
      ["Month", "Delivered orders", "Gross (USD)", `Commission ${commissionPct}% (USD)`, "Net (USD)", "Paid out (USD)"],
      ...rows.map((r) => [r.month, r.orders, r.gross.toFixed(2), r.commission.toFixed(2), r.net.toFixed(2), r.paidOut.toFixed(2)]),
    ]);
    toast(fr ? "Relevé CSV téléchargé" : "Statement CSV downloaded");
  }

  const slug = sellerStore.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store";

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Relevés" : "Statements"}
        subtitle={fr ? "Relevé mensuel calculé à partir de vos commandes livrées et versements payés" : "Monthly statement computed from your delivered orders and paid payouts"}
        backHref="/seller/finance"
        actions={
          statements.length > 0 ? (
            <button type="button" onClick={() => csvFor(statements, `somba-statements-${slug}.csv`)} className="rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">
              {fr ? "Tout télécharger (CSV)" : "Download all (CSV)"}
            </button>
          ) : undefined
        }
      />
      <DetailSection title={fr ? "Relevés disponibles" : "Available Statements"}>
        {statements.length === 0 ? (
          <p className="text-sm text-slate-500">
            {fr ? "Aucune commande livrée ni versement pour le moment." : "No delivered orders or payouts yet."}
          </p>
        ) : (
          <DataTable
            columns={[
              { key: "month", label: fr ? "Mois" : "Month", render: (row) => monthLabel(String(row.month)) },
              { key: "orders", label: fr ? "Commandes livrées" : "Delivered orders" },
              { key: "gross", label: fr ? "Brut" : "Gross", render: (row) => formatCurrency(row.gross as number, locale) },
              { key: "commission", label: "Commission", render: (row) => formatCurrency(row.commission as number, locale) },
              { key: "net", label: "Net", render: (row) => formatCurrency(row.net as number, locale) },
              { key: "paidOut", label: fr ? "Versé" : "Paid out", render: (row) => formatCurrency(row.paidOut as number, locale) },
              { key: "actions", label: fr ? "Action" : "Action", render: (row) => (
                <button type="button" onClick={() => csvFor(statements.filter((s) => s.month === row.month), `somba-statement-${slug}-${String(row.month)}.csv`)} className="text-sm text-[var(--primary)] hover:underline">
                  {fr ? "Télécharger CSV" : "Download CSV"}
                </button>
              )},
            ]}
            data={statements as unknown as Record<string, unknown>[]}
          />
        )}
      </DetailSection>
    </div>
  );
}
