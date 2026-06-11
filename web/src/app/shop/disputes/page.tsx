"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";
import { localizedField, statusLabel } from "@/lib/locale-helpers";

export default function ShopDisputesListPage() {
  const { disputes } = useDisputes();
  const { locale, t } = useLocale();
  const customerDisputes = disputes.filter((d) => d.buyerName === "Marie Dupont" || d.buyerId === "cust-1");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("disputes")}
        subtitle={t("trackOrderDisputes")}
        breadcrumbs={[
          { label: t("account"), href: "/shop/account" },
          { label: t("disputes") },
        ]}
      />

      {customerDisputes.length === 0 ? (
        <div className="card-premium p-8 text-center text-slate-500">
          {t("noOpenDisputes")}
        </div>
      ) : (
        <div className="space-y-3">
          {customerDisputes.map((d) => (
            <Link
              key={d.id}
              href={`/shop/disputes/${d.id}`}
              className="card-premium block p-5 transition-colors hover:border-blue-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{d.id}</p>
                  <p className="text-sm text-slate-500">{d.orderId} · {d.sellerName}</p>
                  <p className="mt-1 text-sm text-slate-600">{localizedField(locale, d.description, d.descriptionFr)}</p>
                </div>
                <Badge variant={d.status === "resolved" ? "success" : "warning"}>{statusLabel(locale, d.status)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
