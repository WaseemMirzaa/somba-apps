"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { MOCK_ADMIN_PAYOUTS } from "@/lib/shared-entities";

export default function AdminPayoutsPage() {
  const { t, locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("payoutQueue")}
        subtitle="Δ4 — weekly, $10 min, 48h clearance"
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("payouts") }]}
      />
      {MOCK_ADMIN_PAYOUTS.map((p) => (
        <Link key={p.id} href={`/admin/payouts/${p.id}`} className="card-premium block p-4 transition-colors hover:border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                <Link href={`/admin/sellers/${p.sellerId}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{p.seller}</Link>
              </p>
              <DualCurrency amount={p.amount} />
              <p className="text-xs text-slate-500">{p.requestedAt}</p>
            </div>
            <Badge variant="warning">{statusLabel(locale, p.status)}</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
