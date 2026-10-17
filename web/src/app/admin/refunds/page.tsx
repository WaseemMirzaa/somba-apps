"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { NoticeBar } from "@/components/admin/notice-bar";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { canMoveMoney, errMsg, useRole, type PaymentRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "succeeded", label: "Paid (refundable)", labelFr: "Payé (remboursable)" },
  { value: "refunded", label: "Refunded", labelFr: "Remboursé" },
];

export default function AdminRefundsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const rt = useRealtime();
  const role = useRole();
  const fr = locale === "fr";
  const mayRefund = canMoveMoney(role);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [target, setTarget] = useState<PaymentRow | null>(null);
  const [toWallet, setToWallet] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (rt.payments as PaymentRow[])
        .filter((p) => !!p.orderId && p.purpose !== "topup" && (p.status === "succeeded" || p.status === "refunded"))
        .map((p) => ({ ...p, date: p.createdAt.slice(0, 10) })),
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

  async function refund() {
    if (!target?.orderId) return;
    setBusy(true);
    setError(null);
    try {
      await socketClient.request("orders:refund", { orderId: target.orderId, toWallet });
      toast(fr ? `Commande ${target.orderReference} remboursée` : `Order ${target.orderReference} refunded`, "success");
      setTarget(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

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
                render: (row) => (
                  <Badge variant={row.status === "refunded" ? "default" : "success"}>
                    {row.status === "refunded" ? (fr ? "Remboursé" : "Refunded") : fr ? "Payé" : "Paid"}
                  </Badge>
                ),
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
                    <Button variant="approve" size="sm" className="whitespace-nowrap" onClick={() => { setTarget(p); setToWallet(true); setError(null); }}>
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

      <Modal
        open={!!target}
        onClose={() => !busy && setTarget(null)}
        title={fr ? "Confirmer le remboursement" : "Confirm refund"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTarget(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={refund} disabled={busy}>{busy ? "…" : fr ? "Rembourser" : "Refund"}</Button>
          </>
        }
      >
        {target && (
          <>
            <p>
              {target.orderReference} · {formatCurrency(target.amountUsd, locale)} · {target.method.replace(/_/g, " ")}
            </p>
            <label className="flex items-center gap-2">
              <input type="radio" checked={toWallet} onChange={() => setToWallet(true)} />
              {fr ? "Vers le portefeuille du client" : "To the customer's wallet"}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!toWallet} onChange={() => setToWallet(false)} />
              {fr ? "Vers le moyen de paiement d'origine" : "To the original payment method"}
            </label>
            <ErrorNote message={error} />
          </>
        )}
      </Modal>
    </div>
  );
}
