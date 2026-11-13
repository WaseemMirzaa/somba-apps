"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SellerPortalDefaults, SellerPortalAccessSelects, useAfterSaleDefaults } from "@/components/admin/seller-portal-access";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useServerList } from "@/lib/admin-live";
import type { Seller } from "@/lib/realtime/types";
import type { AccessKey } from "@/lib/seller-aftersale";

type Row = Seller & { afterSaleAccessOverride?: Partial<Record<AccessKey, boolean | null>> };

/**
 * Seller portal: after-sale sections (docs/contracts/admin-controls.md §13). The default of each section, then every store with its
 * own Follow default / On / Off. For the Super Admin, Operations and Support (Support has no store pages of its own).
 */
export default function AdminSellerPortalPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { defaults } = useAfterSaleDefaults();
  const sellers = useServerList<Row>("sellers:list", { pushEvents: ["seller:updated"], body: { limit: 200 } });
  const [q, setQ] = useState("");
  const rows = useMemo(() => sellers.items.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())), [sellers.items, q]);
  const title = fr ? "Portail vendeur" : "Seller portal";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={fr ? "Quelles sections d'après-vente les boutiques voient en lecture seule" : "Which after-sale sections stores see, read-only"}
        breadcrumbs={[adminBreadcrumb(locale), { label: title }]}
      />
      <div className="card-premium space-y-3 p-6">
        <h3 className="font-semibold">{fr ? "Portail vendeur : sections après-vente" : "Seller portal: after-sale sections"}</h3>
        <SellerPortalDefaults />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">{fr ? "Réglage par boutique" : "Per store"}</h3>
          <input className="input-premium w-full max-w-xs px-4 py-2 text-sm" placeholder={fr ? "Rechercher une boutique…" : "Search a store…"} value={q} onChange={(e) => setQ(e.target.value)} aria-label={fr ? "Rechercher une boutique" : "Search a store"} />
        </div>
        {sellers.error && <SectionError message={sellers.error} onRetry={sellers.reload} />}
        {sellers.loading ? (
          <SectionLoading />
        ) : (
          <div className="space-y-3">
            {rows.length === 0 && <p className="text-sm text-slate-500">{fr ? "Aucune boutique." : "No stores."}</p>}
            {rows.map((s) => (
              <Card key={s.id}>
                <CardContent className="space-y-3 p-4">
                  <p id={s.id} className="font-semibold text-slate-900">
                    {s.name}
                  </p>
                  <SellerPortalAccessSelects sellerId={s.id} override={s.afterSaleAccessOverride} defaults={defaults} onChanged={() => void sellers.reload()} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
