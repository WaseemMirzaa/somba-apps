"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { getSellerStatement } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const stmt = getSellerStatement(id);

  if (!stmt) return <div className="p-8 text-center text-slate-500">Statement not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={stmt.month} subtitle="Monthly financial statement" backHref="/seller/finance/statements" />
      <DetailSection title="Summary">
        <InfoGrid items={[
          { label: "Revenue", value: formatCurrency(stmt.revenue, locale) },
          { label: "Fees", value: formatCurrency(stmt.fees, locale) },
          { label: "Payouts", value: formatCurrency(stmt.payouts, locale) },
          { label: "Net", value: formatCurrency(stmt.net, locale) },
          { label: "Orders", value: stmt.orders },
        ]} />
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => toast(`${stmt.month} PDF downloaded`)}>Download PDF</Button>
          <Link href="/seller/finance/transactions" className="rounded-lg border px-4 py-2 text-sm text-sky-600 hover:bg-sky-50">View transactions →</Link>
        </div>
      </DetailSection>
    </div>
  );
}
