"use client";

import { paymentMethodLabel } from "@/lib/payment-methods";
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
import { canMoveMoney, useFinanceVersion, useRole, type PaymentRow } from "@/lib/admin-live";
import { useSocketQuery } from "@/lib/admin-stats";
import { formatCurrency } from "@/lib/utils";
import { refundDestination, refundFigures, refundNote, refundReason, refundsByPayment, type RefundEntry } from "@/lib/refunds";

const STATUS_OPTIONS = [
  { value: "succeeded", label: "Paid (not refunded)", labelFr: "Payé (non remboursé)" },
  { value: "partial", label: "Partly refunded", labelFr: "Remboursé en partie" },
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
  // Every refund, whatever path made it (a return's refund leaves the payment itself "succeeded"): the server's ledger.
  const refundKey = useFinanceVersion(mayRefund);
  const ledger = useSocketQuery<RefundEntry[]>("payments:refunds", undefined, { enabled: mayRefund, refreshKey: refundKey });
  const entriesOf = useMemo(() => refundsByPayment(ledger.data), [ledger.data]);

  const rows = useMemo(
    () =>
      (rt.payments as PaymentRow[])
        .filter((p) => !!p.orderId && p.purpose !== "topup" && (p.status === "succeeded" || p.status === "refunded"))
        .map((p) => {
          const f = refundFigures(p);
          // The status filter reads this: "succeeded" = untouched, "partial" = part of it went back, "refunded" = all of it.
          return { ...p, date: localDay(p.createdAt), shown: f.state === "full" ? "refunded" : f.state === "partial" ? "partial" : "succeeded" };
        }),
    [rt.payments],
  );

  const filtered = useMemo(
    () =>
      applyListFilters(rows, filters, {
        searchFields: ["reference", "orderReference", "method"],
        dateField: "date",
        statusField: "shown",
      }),
    [rows, filters],
  );

  const refundable = rows.filter((r) => refundFigures(r).refundableUsd >= 0.01).length;
  const money = (n: number) => formatCurrency(n, locale);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Remboursements" : "Refunds"}
        subtitle={
          fr
            ? "Paiements réels : remboursez ce qu'il reste d'une commande payée, ou consultez tous les remboursements déjà faits (retours compris)"
            : "Live payments: refund what is left of a paid order, or review every refund already issued (returns included)"
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
            {fr ? `${refundable} paiement(s) encore remboursable(s)` : `${refundable} payment(s) still refundable`}
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
              { key: "method", label: fr ? "Méthode" : "Method", render: (row) => <Badge variant="info">{paymentMethodLabel(String(row.method), fr)}</Badge> },
              {
                key: "status",
                label: t("status"),
                render: (row) => {
                  const p = row as unknown as PaymentRow;
                  const f = refundFigures(p);
                  const entries = entriesOf.get(p.id) ?? [];
                  return (
                    <div>
                      <Badge variant={f.state === "full" ? "default" : f.state === "partial" ? "warning" : "success"}>
                        {f.state === "full" ? (fr ? "Remboursé" : "Refunded") : f.state === "partial" ? (fr ? "Remboursé en partie" : "Partly refunded") : fr ? "Payé" : "Paid"}
                      </Badge>
                      {f.refundedUsd > 0 && (
                        <p className="mt-1 text-xs font-medium text-slate-600" data-testid="refund-total">
                          {fr ? "Remboursé" : "Refunded"} {money(f.refundedUsd)} {fr ? "sur" : "of"} {money(p.amountUsd)}
                          {f.state === "partial" ? ` · ${fr ? "reste" : "left"} ${money(f.refundableUsd)}` : ""}
                        </p>
                      )}
                      {entries.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-500" data-testid="refund-entries">
                          {entries.map((e) => (
                            <li key={e.id}>
                              <span className="font-medium text-slate-700">−{money(e.amountUsd)}</span> {refundDestination(e, fr)} · {refundReason(e, fr)} · {localDay(e.createdAt)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        f.refundedUsd > 0 && !ledger.loading && p.refundTo && <p className="mt-1 text-xs text-slate-400">{refundDestination({ refundTo: p.refundTo, status: p.refundStatus === "sending" ? "sending" : p.refundStatus === "failed" ? "failed" : "completed" }, fr)}</p>
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
                  const f = refundFigures(p);
                  const note = refundNote(p, fr, money);
                  if (!mayRefund) return <span className="text-sm text-slate-400">—</span>;
                  // Limited to what is left; off, with the reason, when nothing is.
                  return (
                    <div className="max-w-[16rem]">
                      <Button
                        variant="approve"
                        size="sm"
                        className="whitespace-nowrap"
                        disabled={f.refundableUsd < 0.01}
                        title={note ?? undefined}
                        onClick={() => setTarget(p)}
                      >
                        {fr ? "Autoriser le remboursement" : "Authorise refund"}
                      </Button>
                      {f.refundableUsd >= 0.01 && f.state === "partial" && (
                        <p className="mt-1 text-xs text-amber-700">{fr ? `Jusqu'à ${money(f.refundableUsd)} (le reste a déjà été remboursé).` : `Up to ${money(f.refundableUsd)} (the rest was already refunded).`}</p>
                      )}
                      {f.refundableUsd < 0.01 && note && <p className="mt-1 text-xs text-slate-500" data-testid="refund-blocked">{note}</p>}
                    </div>
                  );
                },
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <RefundDialog
        target={target?.orderId ? { orderId: target.orderId, orderReference: target.orderReference ?? null, amountUsd: target.amountUsd, method: target.method, status: target.status, refundedUsd: target.refundedUsd, refundableUsd: target.refundableUsd } : null}
        fr={fr}
        locale={locale}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
