"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { useReturns } from "@/context/return-context";
import { useLocale } from "@/context/locale-context";

const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "danger" | "default"> = {
  requested: "warning",
  approved: "info",
  in_transit: "info",
  received: "info",
  refunded: "success",
  rejected: "danger",
};

export default function ShopReturnsListPage() {
  const { returns } = useReturns();
  const { locale, t } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("returns")}
        subtitle={fr ? "Suivez vos demandes de retour" : "Track your return requests"}
        breadcrumbs={[
          { label: fr ? "Compte" : "Account", href: "/shop/account" },
          { label: t("returns") },
        ]}
      />

      {returns.length === 0 ? (
        <div className="card-premium p-8 text-center text-slate-500">
          {fr ? "Aucun retour pour le moment." : "No returns yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map((ret) => (
            <Link
              key={ret.id}
              href={`/shop/returns/${ret.id}`}
              className="card-premium flex items-center justify-between p-5 transition-colors hover:border-blue-200"
            >
              <div>
                <p className="font-semibold text-slate-900">{ret.id}</p>
                <p className="text-sm text-slate-500">{ret.orderId} · {ret.items.join(", ")}</p>
                <p className="mt-1 text-xs text-slate-400">{ret.createdAt}</p>
              </div>
              <Badge variant={STATUS_VARIANT[ret.status] ?? "default"}>{ret.status.replace("_", " ")}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
