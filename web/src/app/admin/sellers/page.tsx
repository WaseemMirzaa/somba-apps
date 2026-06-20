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

  const filtered = useMemo(
    () =>
      applyListFilters(sellerEntities, filters, {
        searchFields: ["storeName", "owner", "email", "category", "id"],
        dateField: "date",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("sellers")}
        subtitle={fr ? "Vue liste — survol rapide uniquement. Infos complètes sur la page de détail." : "List View — quick scanning only. Full info on detail page."}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("sellers") }]}
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
