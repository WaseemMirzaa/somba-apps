"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { formatCurrency } from "@/lib/utils";

const PENDING_REFUNDS = [
  {
    id: "REF-001",
    orderId: "ORD-2024-001",
    amount: 1199,
    method: "Stripe",
    methodFr: "Stripe",
    reason: "Return approved",
    reasonFr: "Retour approuvé",
    createdAt: "2024-06-07",
  },
  {
    id: "REF-002",
    orderId: "ORD-2024-003",
    amount: 129,
    method: "Manual — Airtel Money",
    methodFr: "Manuel — Airtel Money",
    reason: "Pay-at-delivery refund via Airtel",
    reasonFr: "Remboursement à la livraison via Airtel",
    createdAt: "2024-06-06",
  },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
];

export default function AdminRefundsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [approved, setApproved] = useState<string[]>([]);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const title = locale === "fr" ? "Autorisation de remboursement" : "Refund Authorisation";
  const subtitle =
    locale === "fr"
      ? "AF-15 — Valider les remboursements en attente"
      : "AF-15 — Authorise pending refunds before payout";

  const refunds = useMemo(
    () =>
      PENDING_REFUNDS.map((refund) => ({
        ...refund,
        status: approved.includes(refund.id) ? "approved" : "pending",
      })),
    [approved]
  );

  const filtered = useMemo(
    () =>
      applyListFilters(refunds, filters, {
        searchFields: ["id", "orderId", "method", "reason"],
        dateField: "createdAt",
        statusField: "status",
      }),
    [refunds, filters]
  );

  const pendingCount = refunds.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: locale === "fr" ? "Remboursements" : "Refunds" },
        ]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={
          locale === "fr"
            ? "ID remboursement, commande, motif…"
            : "Refund ID, order, reason…"
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-[var(--border)] px-5 py-3 text-sm text-slate-500">
            {locale === "fr"
              ? `${pendingCount} remboursement(s) en attente`
              : `${pendingCount} refund(s) pending authorisation`}
          </div>
          <DataTable
            columns={[
              {
                key: "id",
                label: locale === "fr" ? "ID remboursement" : "Refund ID",
                render: (row) => (
                  <span className="font-medium text-slate-900">{String(row.id)}</span>
                ),
              },
              {
                key: "orderId",
                label: locale === "fr" ? "Commande" : "Order",
                render: (row) => (
                  <Link
                    href={`/admin/orders/${row.orderId}`}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {String(row.orderId)}
                  </Link>
                ),
              },
              {
                key: "amount",
                label: t("amount"),
                render: (row) => (
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(row.amount as number, locale)}
                  </span>
                ),
              },
              {
                key: "method",
                label: locale === "fr" ? "Méthode" : "Method",
                render: (row) => <Badge variant="info">{locale === "fr" ? String(row.methodFr ?? row.method) : String(row.method)}</Badge>,
              },
              {
                key: "reason",
                label: locale === "fr" ? "Motif" : "Reason",
                render: (row) => (
                  <span className="max-w-[12rem] text-slate-600">{locale === "fr" ? String(row.reasonFr ?? row.reason) : String(row.reason)}</span>
                ),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={row.status === "approved" ? "success" : "warning"}>
                    {row.status === "approved" ? t("approved") : t("pending")}
                  </Badge>
                ),
              },
              {
                key: "createdAt",
                label: t("date"),
              },
              {
                key: "actions",
                label: t("action"),
                render: (row) => {
                  const id = String(row.id);
                  if (approved.includes(id)) {
                    return (
                      <span className="ml-4 text-sm font-medium text-emerald-600">
                        {t("approved")}
                      </span>
                    );
                  }
                  return (
                    <Button
                      size="sm"
                      className="ml-4 whitespace-nowrap"
                      onClick={() => {
                        setApproved((current) => [...current, id]);
                        toast(
                          locale === "fr"
                            ? `Remboursement ${id} autorisé`
                            : `Refund ${id} authorised`
                        );
                      }}
                    >
                      {locale === "fr" ? "Autoriser le remboursement" : "Authorise Refund"}
                    </Button>
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
