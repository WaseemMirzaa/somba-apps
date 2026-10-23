"use client";

import { localDay } from "@/lib/dates";
import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { RefundDialog } from "@/components/admin/refund-dialog";
import { NoticeBar } from "@/components/admin/notice-bar";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { canMoveMoney, useRole, type PaymentRow } from "@/lib/admin-live";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "succeeded", label: "Paid (refundable)", labelFr: "Payé (remboursable)" },
  { value: "refunded", label: "Refunded", labelFr: "Remboursé" },
];

export default function AdminRefundsPage() {
  const { t, locale } = useLocale();
  const rt = useRealtime();
  const role = useRole();
  const fr = locale === "fr";
  const mayRefund = canMoveMoney(role);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [target, setTarget] = useState<PaymentRow | null>(null);

  const rows = useMemo(
    () =>
      (rt.payments as PaymentRow[])
        .filter((p) => !!p.orderId && p.purpose !== "topup" && (p.status === "succeeded" || p.status === "refunded"))
        .map((p) => ({ ...p, date: localDay(p.createdAt) })),
    [rt.payments],
  );

  const filtered = useMemo(
    () =>
      applyListFilters(rows, filters, {
        searchFields: ["reference", "orderReference", "method"],
        dateField: "date",
        statusField: "status",
      }),
    [rows, filters],
  );

  const refundable = rows.filter((r) => r.status === "succeeded").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Remboursements" : "Refunds"}
        subtitle={
          fr
            ? "Paiements réels : remboursez une commande payée, ou consultez les remboursements déjà faits"
            : "Live payments: refund a paid order, or review refunds already issued"
        }
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Remboursements" : "Refunds" }]}
      />

      {!mayRefund && (
        <NoticeBar tone="warn">{fr ? "Seuls l'admin et la finance peuvent rembourser." : "Only admin and finance can issue refunds."}</NoticeBar>
      )}

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Référence, commande, méthode…" : "Reference, order, method…"}
      />

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-[var(--border)] px-5 py-3 text-sm text-slate-500">
            {fr ? `${refundable} paiement(s) remboursable(s)` : `${refundable} refundable payment(s)`}
          </div>
          <DataTable
            emptyMessage={fr ? "Aucun paiement" : "No payments yet"}
            columns={[
              { key: "reference", label: fr ? "Paiement" : "Payment", render: (row) => <span className="font-medium text-slate-900">{String(row.reference)}</span> },
              {
                key: "orderReference",
                label: fr ? "Commande" : "Order",
                render: (row) => (
                  <Link href={`/admin/orders/${row.orderId}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.orderReference)}
                  </Link>
                ),
              },
              { key: "amountUsd", label: t("amount"), render: (row) => <span className="font-semibold text-slate-900">{formatCurrency(row.amountUsd as number, locale)}</span> },
              { key: "method", label: fr ? "Méthode" : "Method", render: (row) => <Badge variant="info">{String(row.method).replace(/_/g, " ")}</Badge> },
              {
                key: "status",
                label: t("status"),
                render: (row) => {
                  const p = row as unknown as PaymentRow;
                  const where =
                    p.refundTo === "phone"
                      ? p.refundStatus === "sending"
                        ? fr ? "vers le téléphone · en cours" : "to phone · sending"
                        : fr ? "vers le téléphone" : "to phone"
                      : p.refundTo === "wallet"
                        ? p.refundStatus === "failed"
                          ? fr ? "portefeuille (échec téléphone)" : "wallet (phone refund failed)"
                          : fr ? "vers le portefeuille" : "to wallet"
                        : null;
                  return (
                    <div>
                      <Badge variant={p.status === "refunded" ? "default" : "success"}>
                        {p.status === "refunded" ? (fr ? "Remboursé" : "Refunded") : fr ? "Payé" : "Paid"}
                      </Badge>
                      {p.status === "refunded" && where && (
                        <p className="mt-1 text-xs text-slate-400">
                          {p.refundedUsd != null ? `${formatCurrency(p.refundedUsd, locale)} ` : ""}{where}
                        </p>
                      )}
                    </div>
                  );
                },
              },
              { key: "date", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => {
                  const p = row as unknown as PaymentRow;
                  if (p.status === "refunded") return <span className="text-sm text-slate-400">{fr ? "Remboursé" : "Refunded"}</span>;
                  if (!mayRefund) return <span className="text-sm text-slate-400">—</span>;
                  return (
                    <Button variant="approve" size="sm" className="whitespace-nowrap" onClick={() => setTarget(p)}>
                      {fr ? "Autoriser le remboursement" : "Authorise refund"}
                    </Button>
                  );
                },
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <RefundDialog
        target={target?.orderId ? { orderId: target.orderId, orderReference: target.orderReference ?? null, amountUsd: target.amountUsd, method: target.method } : null}
        fr={fr}
        locale={locale}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
