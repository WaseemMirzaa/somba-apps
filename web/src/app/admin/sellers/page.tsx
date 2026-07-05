"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { sellerEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { adminBreadcrumb, categoryLabel } from "@/lib/admin-i18n";
import { useModeration } from "@/context/moderation-context";
import { useToast } from "@/context/toast-context";
import { api } from "@/lib/api";
import { useApiResource, useApiAction } from "@/lib/use-api";

interface SellerLive {
  id: string;
  storeName: string;
  slug: string;
  status: "pending" | "active" | "suspended" | "rejected";
  badge: string;
  commissionRate: number;
  rating: number;
  healthScore: number;
  city?: string;
  phone?: string;
  balanceUsd: number;
  productCount: number;
  orderCount: number;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "suspended", label: "Suspended", labelFr: "Suspendu" },
];

const SELLER_STATUS_FR: Record<string, string> = { pending: "En attente", approved: "Approuvé", suspended: "Suspendu" };

const CATEGORY_FR: Record<string, string> = {
  Electronics: "Électronique",
  Fashion: "Mode",
  "Home & Living": "Maison & Décoration",
  Beauty: "Beauté",
  Grocery: "Épicerie",
};

export default function AdminSellersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { isSellerBlocked, blockSeller, unblockSeller } = useModeration();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const { data: liveSellers, live, reload } = useApiResource<SellerLive[]>("/admin/sellers");
  const { busy, run } = useApiAction();

  const liveRows = useMemo(
    () =>
      (liveSellers ?? []).map((s) => ({
        id: s.id,
        storeName: s.storeName,
        owner: s.city ?? "—",
        email: s.phone ?? "—",
        category: s.badge,
        orders: s.orderCount,
        revenue: s.balanceUsd,
        status: s.status === "active" ? "approved" : s.status,
        rawStatus: s.status,
        date: "—",
      })),
    [liveSellers]
  );

  const mockFiltered = useMemo(
    () =>
      applyListFilters(sellerEntities, filters, {
        searchFields: ["storeName", "owner", "email", "category", "id"],
        dateField: "date",
        statusField: "status",
      }),
    [filters]
  );

  const liveFiltered = useMemo(
    () =>
      applyListFilters(liveRows, filters, {
        searchFields: ["storeName", "owner", "email", "category", "id"],
        dateField: "date",
        statusField: "status",
      }),
    [liveRows, filters]
  );

  const filtered = live ? liveFiltered : mockFiltered;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("sellers")}
        subtitle={fr ? "Vue liste — survol rapide uniquement. Infos complètes sur la page de détail." : "List View — quick scanning only. Full info on detail page."}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("sellers") }]}
        actions={live ? <Badge variant="success">Live API</Badge> : undefined}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Boutique, propriétaire, e-mail…" : "Store, owner, email…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "storeName",
                label: fr ? "Boutique" : "Store",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.storeName)}
                  </Link>
                ),
              },
              { key: "owner", label: fr ? "Propriétaire" : "Owner" },
              { key: "email", label: t("email") },
              {
                key: "category",
                label: fr ? "Catégorie" : "Category",
                render: (row) => categoryLabel(String(row.category), fr),
              },
              {
                key: "orders",
                label: fr ? "Commandes" : "Orders",
                render: (row) => Number(row.orders).toLocaleString(),
              },
              {
                key: "revenue",
                label: fr ? "Chiffre d'affaires" : "Revenue",
                render: (row) => formatCurrency(row.revenue as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) =>
                  isSellerBlocked(Number(row.id)) ? (
                    <Badge variant="danger">{fr ? "Bloqué" : "Blocked"}</Badge>
                  ) : (
                    <Badge variant={row.status === "approved" ? "success" : row.status === "pending" ? "warning" : "danger"}>
                      {fr ? (SELLER_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}
                    </Badge>
                  ),
              },
              { key: "date", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => {
                  if (live) {
                    const id = String(row.id);
                    const raw = String(row.rawStatus);
                    return (
                      <div className="flex items-center gap-3">
                        <Link href={`/admin/sellers/${id}`} className="text-sm text-[var(--primary)] hover:underline">
                          {t("view")}
                        </Link>
                        {raw === "pending" && (
                          <button
                            disabled={busy === `approve-${id}`}
                            onClick={async () => {
                              await run(`approve-${id}`, () => api.post(`/admin/sellers/${id}/approve`));
                              toast(fr ? `${row.storeName} approuvé` : `${row.storeName} approved`);
                              reload();
                            }}
                            className="text-sm font-medium text-emerald-600 hover:underline disabled:opacity-50"
                          >
                            {t("approve")}
                          </button>
                        )}
                        {(raw === "pending" || raw === "active") && (
                          <button
                            disabled={busy === `suspend-${id}`}
                            onClick={async () => {
                              await run(`suspend-${id}`, () => api.post(`/admin/sellers/${id}/suspend`));
                              toast(fr ? `${row.storeName} suspendu` : `${row.storeName} suspended`, "info");
                              reload();
                            }}
                            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                          >
                            {fr ? "Suspendre" : "Suspend"}
                          </button>
                        )}
                      </div>
                    );
                  }
                  const blocked = isSellerBlocked(Number(row.id));
                  return (
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/sellers/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
                        {t("view")}
                      </Link>
                      <button
                        onClick={() => {
                          if (blocked) {
                            unblockSeller(Number(row.id));
                            toast(fr ? `${row.storeName} débloqué` : `${row.storeName} unblocked`);
                          } else {
                            blockSeller(Number(row.id));
                            toast(fr ? `${row.storeName} bloqué` : `${row.storeName} blocked`, "info");
                          }
                        }}
                        className={blocked ? "text-sm font-medium text-emerald-600 hover:underline" : "text-sm font-medium text-red-600 hover:underline"}
                      >
                        {blocked ? (fr ? "Débloquer" : "Unblock") : (fr ? "Bloquer" : "Block")}
                      </button>
                    </div>
                  );
                },
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
