"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { MOCK_ADMIN_PAYOUTS } from "@/lib/shared-entities";

export default function AdminPayoutsPage() {
  const { t, locale } = useLocale();
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("payoutQueue")}
        subtitle="Δ4 — weekly, $10 min, 48h clearance"
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("payouts") }]}
      />
      {MOCK_ADMIN_PAYOUTS.map((p) => (
        <div
          key={p.id}
          role="button"
          tabIndex={0}
          onClick={() => router.push(`/admin/payouts/${p.id}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              router.push(`/admin/payouts/${p.id}`);
            }
          }}
          className="card-premium block cursor-pointer p-4 transition-colors hover:border-blue-200"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                <Link href={`/admin/sellers/${p.sellerId}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{p.seller}</Link>
              </p>
              <DualCurrency amount={p.amount} className="text-base font-bold sm:text-lg" />
              <p className="text-xs text-slate-500">{p.requestedAt}</p>
            </div>
            <Badge className="shrink-0" variant="warning">{statusLabel(locale, p.status)}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
