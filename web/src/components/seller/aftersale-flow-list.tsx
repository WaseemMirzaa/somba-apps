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
import { pickText } from "@/lib/i18n-fields";
import {
  EXCHANGE_STAGE_OPTIONS,
  REPLACEMENT_STAGE_OPTIONS,
  exchangeStageLabel,
  exchangeStageVariant,
  replacementStageLabel,
  replacementStageVariant,
  useExchanges,
  useReplacements,
  variantSuffix,
} from "@/lib/seller-aftersale";
import { formatCurrency } from "@/lib/utils";

export type FlowKind = "replacement" | "exchange";

interface FlowRow {
  id: string;
  reference: string;
  orderReference: string;
  customerName: string;
  item: string;
  sku: string;
  detail: string;
  diff: number | null;
  status: string;
  due: string | null;
  day: string;
  deliveredAt: string | null;
}

/** Replacements (`kind="replacement"`) or exchanges (`kind="exchange"`) on the store's items, live. */
export function AftersaleFlowList({ kind }: { kind: FlowKind }) {
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const base = kind === "replacement" ? "/seller/replacements" : "/seller/exchanges";
  const reps = useReplacements();
  const excs = useExchanges();
  const q = kind === "replacement" ? reps : excs;
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const rows = useMemo<FlowRow[]>(() => {
    if (kind === "replacement") {
      return (reps.data ?? []).map((r) => ({
        id: r.id,
        reference: r.reference,
        orderReference: r.orderReference,
        customerName: r.customerName,
        item: `${pickText(fr, r.productName, r.productNameFr)}${variantSuffix(r.variant, fr)} × ${r.qty}`,
        sku: r.sku,
        detail: r.reason ?? "",
        diff: null as number | null,
        status: r.status,
        due: r.sellerDueAt,
        day: localDay(r.createdAt),
        deliveredAt: r.deliveredAt,
      }));
    }
    return (excs.data ?? []).map((x) => ({
      id: x.id,
      reference: x.reference,
      orderReference: x.orderReference,
      customerName: x.customerName,
      item: `${pickText(fr, x.fromName, x.fromNameFr)}${variantSuffix(x.fromVariant, fr)} → ${pickText(fr, x.toName, x.toNameFr)}${variantSuffix(x.toVariant, fr)}`,
      sku: x.fromSku,
      detail: x.reason ?? "",
      diff: x.priceDiffUsd,
      status: x.status,
      due: x.sellerDueAt,
      day: localDay(x.createdAt),
      deliveredAt: x.deliveredAt,
    }));
  }, [kind, reps.data, excs.data, fr]);

  const filtered = useMemo(
    () =>
      applyListFilters(rows, filters, {
        searchFields: ["reference", "orderReference", "customerName", "item", "sku", "detail"],
        dateField: "day",
        statusField: "status",
      }),
    [rows, filters],
  );
  const waiting = rows.filter((r) => r.status === "requested").length;
  const title = kind === "replacement" ? t("replacements") : fr ? "Échanges" : "Exchanges";
  const stageLabel = kind === "replacement" ? replacementStageLabel : exchangeStageLabel;
  const stageVariant = kind === "replacement" ? replacementStageVariant : exchangeStageVariant;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={
          kind === "replacement"
            ? fr
              ? "Demandes de remplacement sur vos articles : approuvez ou refusez, puis suivez l'envoi du nouvel article par l'entrepôt."
              : "Replacement requests on your items: approve or reject, then follow the warehouse sending the new item."
            : fr
              ? "Demandes d'échange (autre taille, couleur ou article) : approuvez ou refusez ; l'écart de prix est géré via le portefeuille du client."
              : "Exchange requests (another size, colour or item): approve or reject; the price difference goes through the customer's wallet."
        }
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: title }]}
      />
      {q.error && <LoadError message={q.error} onRetry={q.reload} />}
      {waiting > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {fr ? `${waiting} demande(s) attendent votre réponse.` : `${waiting} request${waiting === 1 ? " is" : "s are"} waiting for your answer.`}
        </div>
      )}
      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={kind === "replacement" ? REPLACEMENT_STAGE_OPTIONS : EXCHANGE_STAGE_OPTIONS}
        searchPlaceholder={fr ? "N°, commande, client, article…" : "ID, order, customer, item…"}
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
                  label: fr ? "N° dossier" : "Case ID",
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
                  key: "item",
                  label: kind === "replacement" ? (fr ? "Article" : "Item") : fr ? "Échange" : "Swap",
                  render: (row) => <span className="block max-w-[18rem] break-words text-sm">{String(row.item)}</span>,
                },
                ...(kind === "exchange"
                  ? [
                      {
                        key: "diff",
                        label: fr ? "Écart de prix" : "Price difference",
                        render: (row: Record<string, unknown>) => (row.diff == null ? "—" : formatCurrency(Number(row.diff), locale)),
                      },
                    ]
                  : []),
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => (
                    <span className="flex flex-col items-start gap-1">
                      <Badge variant={stageVariant(String(row.status))}>{stageLabel(String(row.status), fr)}</Badge>
                      {row.status === "requested" ? <Countdown until={row.due as string | null} /> : null}
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
                      className={row.status === "requested" ? "rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white" : "text-sm text-[var(--primary)] hover:underline"}
                    >
                      {row.status === "requested" ? (fr ? "Répondre" : "Answer") : t("view")}
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
