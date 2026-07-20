"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { useAdminData } from "@/lib/admin";
import { type AdminPayoutEntity, type AdminPayoutStatus } from "@/lib/admin-entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "requested", label: "Requested", labelFr: "Demandé" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
  { value: "paid", label: "Paid", labelFr: "Payé" },
];

const statusVariant: Record<AdminPayoutStatus, "success" | "warning" | "danger" | "info" | "default"> = {
  requested: "warning",
  approved: "info",
  rejected: "danger",
  paid: "success",
};

const statusLabel: Record<AdminPayoutStatus, { en: string; fr: string }> = {
  requested: { en: "Requested", fr: "Demandé" },
  approved: { en: "Approved", fr: "Approuvé" },
  rejected: { en: "Rejected", fr: "Rejeté" },
  paid: { en: "Paid", fr: "Payé" },
};

export default function AdminPayoutsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const { adminPayoutEntities } = useAdminData();
  const [payouts, setPayouts] = useState<AdminPayoutEntity[]>(adminPayoutEntities);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  useEffect(() => {
    setPayouts(adminPayoutEntities);
  }, [adminPayoutEntities]);

  const filtered = useMemo(
    () =>
      applyListFilters(payouts, filters, {
        searchFields: ["id", "seller", "method", "bankAccount"],
        dateField: "requestedAt",
        statusField: "status",
      }),
    [payouts, filters]
  );

  function updateStatus(id: string, status: AdminPayoutStatus) {
    setPayouts((items) => items.map((p) => (p.id === id ? { ...p, status } : p)));
    const label = statusLabel[status][fr ? "fr" : "en"];
    toast(fr ? `Paiement ${id} — ${label.toLowerCase()}` : `Payout ${id} ${status}`);
  }

  const pendingCount = payouts.filter((p) => p.status === "requested").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("payouts")}
        subtitle={
          fr
            ? `Approbation des versements — ${pendingCount} en attente · hebdo, min. 10 $, délai 48 h`
            : `Payout approval — ${pendingCount} pending · weekly, $10 min, 48h clearance`
        }
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: t("payouts") },
        ]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "ID paiement, vendeur, méthode…" : "Payout ID, seller, method…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: fr ? "ID paiement" : "Payout ID",
                render: (row) => (
                  <span className="font-medium text-slate-900">{String(row.id)}</span>
                ),
              },
              {
                key: "seller",
                label: fr ? "Vendeur" : "Seller",
                render: (row) => (
                  <Link
                    href={`/admin/sellers/${row.sellerId}`}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {String(row.seller)}
                  </Link>
                ),
              },
              {
                key: "amount",
                label: t("amount"),
                render: (row) => formatCurrency(row.amount as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => {
                  const status = row.status as AdminPayoutStatus;
                  return (
                    <Badge variant={statusVariant[status] ?? "default"}>
                      {statusLabel[status]?.[fr ? "fr" : "en"] ?? status}
                    </Badge>
                  );
                },
              },
              {
                key: "requestedAt",
                label: fr ? "Date demande" : "Request date",
                render: (row) => String(row.requestedAt),
              },
              {
                key: "actions",
                label: t("action"),
                render: (row) => {
                  const id = String(row.id);
                  const status = row.status as AdminPayoutStatus;
                  const sellerId = row.sellerId as number;

                  if (status === "requested") {
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="approve" size="sm" onClick={() => updateStatus(id, "approved")}>
                          {t("approve")}
                        </Button>
                        <Button variant="reject" size="sm" onClick={() => updateStatus(id, "rejected")}>
                          {t("reject")}
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <Link
                      href={`/admin/sellers/${sellerId}`}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      {t("view")}
                    </Link>
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
