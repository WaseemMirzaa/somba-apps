"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function SellerStatementsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";

  function downloadPdf(month: string) {
    const blob = new Blob([`Somba Statement — ${month}\nRevenue, fees, payouts (mock PDF)`], { type: "application/pdf" });
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
        {["May 2024", "April 2024", "March 2024"].map((m) => (
          <div key={m} className="flex justify-between border-b border-sky-50 py-3 last:border-0">
            <span className="font-medium">{m}</span>
            <button onClick={() => downloadPdf(m)} className="text-sm text-[var(--primary)] hover:underline">{fr ? "Télécharger le PDF" : "Download PDF"}</button>
          </div>
        ))}
      </DetailSection>
    </div>
  );
}
