"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { useToast } from "@/context/toast-context";

export default function SellerStatementsPage() {
  const { toast } = useToast();

  function downloadPdf(month: string) {
    const blob = new Blob([`Somba Statement — ${month}\nRevenue, fees, payouts (mock PDF)`], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${month.replace(" ", "-").toLowerCase()}.pdf`;
    a.click();
    toast(`${month} statement downloaded`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Statements" subtitle="Monthly financial statements" backHref="/seller/finance" />
      <DetailSection title="Available Statements">
        {["May 2024", "April 2024", "March 2024"].map((m) => (
          <div key={m} className="flex justify-between border-b border-sky-50 py-3 last:border-0">
            <span className="font-medium">{m}</span>
            <button onClick={() => downloadPdf(m)} className="text-sm text-sky-600 hover:underline">Download PDF</button>
          </div>
        ))}
      </DetailSection>
    </div>
  );
}
