"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { MOCK_REFUNDS } from "@/lib/shared-entities";

export default function AdminRefundsPage() {
  const { t, locale } = useLocale();
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("refundAuthorisation")}
        subtitle={`${t("refundSpecRef")} — ${t("refundSpecSubtitle")}`}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("refunds") }]}
      />
      {MOCK_REFUNDS.map((r) => (
        <div
          key={r.id}
          role="button"
          tabIndex={0}
          onClick={() => router.push(`/admin/refunds/${r.id}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              router.push(`/admin/refunds/${r.id}`);
            }
          }}
          className="card-premium block cursor-pointer p-4 transition-colors hover:border-blue-200"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.id}</p>
              <p className="text-sm text-slate-500">
                <Link href={`/admin/orders/${r.orderId}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{r.orderId}</Link>
                {" · "}{r.method} · {r.reason}
              </p>
              <DualCurrency amount={r.amount} className="mt-2 text-base font-bold sm:text-lg" />
            </div>
            <Badge className="shrink-0" variant="warning">{statusLabel(locale, r.status)}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
