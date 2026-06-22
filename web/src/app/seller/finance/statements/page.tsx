"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const STATEMENT_MONTHS: { en: string; fr: string }[] = [
  { en: "May 2024", fr: "Mai 2024" },
  { en: "April 2024", fr: "Avril 2024" },
  { en: "March 2024", fr: "Mars 2024" },
];

export default function SellerStatementsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";

  function downloadPdf(month: string) {
    const blob = new Blob([`Somba & Teka Statement — ${month}\nRevenue, fees, payouts (mock PDF)`], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${month.replace(" ", "-").toLowerCase()}.pdf`;
    a.click();
    toast(fr ? `Relevé de ${month} téléchargé` : `${month} statement downloaded`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Relevés" : "Statements"} subtitle={fr ? "Relevés financiers mensuels" : "Monthly financial statements"} backHref="/seller/finance" />
      <DetailSection title={fr ? "Relevés disponibles" : "Available Statements"}>
        {STATEMENT_MONTHS.map((m) => (
          <div key={m.en} className="flex justify-between border-b border-sky-50 py-3 last:border-0">
            <span className="font-medium">{fr ? m.fr : m.en}</span>
            <button onClick={() => downloadPdf(fr ? m.fr : m.en)} className="text-sm text-[var(--primary)] hover:underline">{fr ? "Télécharger le PDF" : "Download PDF"}</button>
          </div>
        ))}
      </DetailSection>
    </div>
  );
}
