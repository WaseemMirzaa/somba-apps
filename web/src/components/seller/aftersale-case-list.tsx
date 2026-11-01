"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { Countdown } from "@/components/seller/countdown";
import { useLocale } from "@/context/locale-context";
import { applyListFilters } from "@/lib/list-filter-utils";
import { localDay } from "@/lib/dates";
import { caseOutcomeLabel, caseOutcomeVariant, caseCategoryLabel, caseStageLabel, caseStageVariant, caseValue, CASE_STAGE_OPTIONS, needsSeller, useCases, type CaseType } from "@/lib/seller-aftersale";
import { formatCurrency } from "@/lib/utils";

/** The list of returns (`type="return"`) or disputes (`type="dispute"`) of the store, live. */
export function AftersaleCaseList({ type }: { type: CaseType }) {
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const base = type === "return" ? "/seller/returns" : "/seller/disputes";
  const q = useCases(type);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const rows = useMemo(
    () =>
      (q.data ?? []).map((c) => ({
        ...c,
        category: caseCategoryLabel(c.category, fr),
        units: c.items.reduce((s, i) => s + i.qty, 0),
        value: caseValue(c),
        action: needsSeller(c),
        day: localDay(c.createdAt),
      })),
    [q.data, fr],
  );
  const filtered = useMemo(
    () =>
      applyListFilters(rows, filters, {
        searchFields: ["reference", "orderReference", "customerName", "reason", "category"],
        dateField: "day",
        statusField: "stage",
      }),
    [rows, filters],
  );
  const waiting = rows.filter((r) => r.action).length;

  const title = type === "return" ? t("returns") : fr ? "Litiges" : "Disputes";
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={
          type === "return"
            ? fr
              ? "Retours demandés sur vos commandes : acceptez ou refusez dans les délais, suivez la collecte, l'inspection et le remboursement."
              : "Returns requested on your orders: accept or reject in time, then follow the pickup, inspection and refund."
            : fr
              ? "Problèmes signalés par vos clients (article manquant, endommagé, non reçu…) : répondez avec un message et des photos, le support Somba tranche."
              : "Problems your customers report (missing, damaged, not received…): reply with a message and photos, Somba support decides."
        }
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: title }]}
      />
      {q.error && <LoadError message={q.error} onRetry={q.reload} />}
      {waiting > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {type === "return"
            ? fr
              ? `${waiting} retour(s) attendent votre réponse.`
              : `${waiting} return${waiting === 1 ? " is" : "s are"} waiting for your answer.`
            : fr
              ? `${waiting} litige(s) attendent votre réponse.`
              : `${waiting} dispute${waiting === 1 ? " is" : "s are"} waiting for your reply.`}
        </div>
      )}
      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={CASE_STAGE_OPTIONS(type)}
        searchPlaceholder={fr ? "N°, commande, client, motif…" : "ID, order, customer, reason…"}
      />
      <Card>
        <CardContent className="p-0">
          {q.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Rien à afficher pour le moment." : "Nothing to show yet."}
              columns={[
                {
                  key: "reference",
                  label: type === "return" ? (fr ? "N° retour" : "Return ID") : fr ? "N° litige" : "Dispute ID",
                  render: (row) => (
                    <Link href={`${base}/${String(row.id)}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.reference)}
                    </Link>
                  ),
                },
                {
                  key: "orderReference",
                  label: fr ? "Commande" : "Order",
                  render: (row) => (
                    <Link href={`/seller/orders/${String(row.orderReference)}`} className="text-[var(--primary)] hover:underline">
                      {String(row.orderReference)}
                    </Link>
                  ),
                },
                { key: "customerName", label: t("customer") },
                {
                  key: "reason",
                  label: fr ? "Motif" : "Reason",
                  render: (row) => (
                    <span className="block max-w-[16rem] text-slate-600">
                      {row.category && row.category !== "—" ? <span className="block text-xs font-semibold text-slate-500">{String(row.category)}</span> : null}
                      <span className="line-clamp-2 break-words">{String(row.reason)}</span>
                    </span>
                  ),
                },
                {
                  key: "value",
                  label: fr ? "Articles" : "Items",
                  render: (row) => (
                    <span>
                      {Number(row.units) > 0 ? `${String(row.units)} · ${formatCurrency(Number(row.value), locale)}` : "—"}
                      {row.refundUsd != null && Number(row.refundUsd) > 0 ? (
                        <span className="block text-xs text-emerald-700">
                          {fr ? "Remboursé" : "Refunded"} {formatCurrency(Number(row.refundUsd), locale)}
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: "stage",
                  label: t("status"),
                  render: (row) => (
                    <span className="flex flex-col items-start gap-1">
                      <Badge variant={caseStageVariant(type, String(row.stage))}>{caseStageLabel(type, String(row.stage), fr)}</Badge>
                      {row.action ? <Countdown until={row.sellerDueAt as string | null} /> : null}
                      {row.outcome ? <Badge variant={caseOutcomeVariant(String(row.outcome))}>{caseOutcomeLabel(String(row.outcome), fr)}</Badge> : null}
                    </span>
                  ),
                },
                { key: "day", label: t("date") },
                {
                  key: "actions",
                  label: t("action"),
                  render: (row) => (
                    <Link
                      href={`${base}/${String(row.id)}`}
                      className={row.action ? "rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white" : "text-sm text-[var(--primary)] hover:underline"}
                    >
                      {row.action ? (type === "return" ? (fr ? "Répondre" : "Answer") : fr ? "Répondre" : "Reply") : t("view")}
                    </Link>
                  ),
                },
              ]}
              data={filtered as unknown as Record<string, unknown>[]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
