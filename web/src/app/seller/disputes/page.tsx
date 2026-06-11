"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";

export default function SellerDisputesPage() {
  const { disputes } = useDisputes();
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader title={t("disputes")} />
      <div className="space-y-2">
        {disputes.map((d) => (
          <Link key={d.id} href={`/seller/disputes/${d.id}`} className="block rounded-xl border p-4 hover:border-sky-200">
            <div className="flex justify-between">
              <span className="font-medium">{d.id}</span>
              <span className="text-xs text-slate-500">{d.status}</span>
            </div>
            <p className="text-sm text-slate-500">{d.orderId} · {d.buyerName}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
