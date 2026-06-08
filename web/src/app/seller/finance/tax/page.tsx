"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";

export default function SellerTaxPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tax Reports" subtitle="Tax ID: CD-123456789" backHref="/seller/finance" />
      <DetailSection title="Tax Reports">
        <p className="text-sm text-slate-500">Quarterly tax reports will appear here.</p>
      </DetailSection>
    </div>
  );
}
