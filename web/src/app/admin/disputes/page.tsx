"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { useDisputes } from "@/context/dispute-context";

export default function AdminDisputesPage() {
  const { t, locale } = useLocale();
  const { disputes } = useDisputes();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("disputesQueue")}
        subtitle={`${disputes.length} ${t("openCases")}`}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("disputes") }]}
      />
      {disputes.map((d) => (
        <Link key={d.id} href={`/admin/disputes/${d.id}`} className="block rounded-xl border p-4 hover:border-blue-200">
          <div className="flex justify-between font-medium">{d.id} <Badge variant="info">{statusLabel(locale, d.status)}</Badge></div>
          <p className="text-sm text-slate-500">{d.buyerName} vs {d.sellerName} · {d.orderId}</p>
        </Link>
      ))}
    </div>
  );
}
