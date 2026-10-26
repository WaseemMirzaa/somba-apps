"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerRequest, useLiveQuery } from "@/lib/seller-api";
import { downloadText, shippingStep, shippingStepLabel, shippingStepVariant, type ServerSellerOrder } from "@/lib/seller-orders";
import {
  errMessage,
  orderStatusLabel,
  packageStatusLabel,
  packageStatusVariant,
  paymentMethodLabel,
} from "@/lib/seller-labels";
import { liveQty, orderAmount } from "@/lib/seller-packages";
import { localDay } from "@/lib/dates";
import { formatCurrency } from "@/lib/utils";
import type { OrderTracking } from "@/lib/seller-orders";

/** Package steps first (what the seller has to do), then the order's own statuses. */
const STATUS_FILTER: { value: string; kind: "package" | "order" }[] = [
  { value: "to_pack", kind: "package" },
  { value: "ready", kind: "package" },
  { value: "at_hub", kind: "package" },
  { value: "pending", kind: "order" },
  { value: "confirmed", kind: "order" },
  { value: "processing", kind: "order" },
  { value: "shipped", kind: "order" },
  { value: "out_for_delivery", kind: "order" },
  { value: "delivered", kind: "order" },
  { value: "cancelled", kind: "order" },
  { value: "returned", kind: "order" },
];

const PAGE_SIZES = [10, 25, 50, 100, 200];

export default function SellerOrdersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Typing is sent to the server after a short pause (the search runs there, over every order).
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch((cur) => (cur === filters.search.trim() ? cur : filters.search.trim()));
    }, 300);
    return () => clearTimeout(id);
  }, [filters.search]);

  const query = useMemo(() => {
    const body: Record<string, unknown> = { limit, offset };
    if (search) body.q = search;
    if (filters.status) body.status = filters.status;
    if (filters.fromDate) body.from = filters.fromDate;
    if (filters.toDate) body.to = filters.toDate;
    return body;
  }, [limit, offset, search, filters.status, filters.fromDate, filters.toDate]);

  const orders = useLiveQuery<{ items: ServerSellerOrder[]; total: number; limit: number; offset: number }>("orders:sellerList", query, {
    pushes: ["order:created", "order:updated", "task:updated", "delivery:updated"],
  });

  const statusOptions = STATUS_FILTER.map((o) => ({
    value: o.value,
    label: o.kind === "package" ? packageStatusLabel(o.value, false) : orderStatusLabel(o.value, false),
    labelFr: o.kind === "package" ? packageStatusLabel(o.value, true) : orderStatusLabel(o.value, true),
  }));

  const total = orders.data?.total ?? 0;
  const rows = useMemo(
    () =>
      (orders.data?.items ?? []).map((o) => {
        const tracking = (o.tracking ?? null) as OrderTracking | null;
        return {
          id: o.reference,
          orderId: o.id,
          customer: (o.customerName ?? "").split(" ")[0] || "—",
          city: o.city || "—",
          items: liveQty(o.items as never),
          amount: orderAmount({ items: o.items as never, subtotalUsd: o.subtotalUsd }),
          paymentMethod: o.paymentMethod,
          packageStatus: o.packageStatus,
          step: shippingStep({ orderStatus: o.status, packageStatus: o.packageStatus, tracking }),
          rider: tracking?.riderFirstName ?? null,
          sellerCount: o.sellerCount,
          date: localDay(o.createdAt),
        };
      }),
    [orders.data],
  );

  function change(next: typeof filters) {
    setOffset(0);
    setFilters(next);
    if (next.search.trim() === "" && search !== "") setSearch("");
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const body = { ...query, format: "csv" } as Record<string, unknown>;
      delete body.limit;
      delete body.offset;
      const res = await sellerRequest<{ filename: string; total: number; csv: string }>("orders:sellerList", body);
      downloadText(res.filename || "orders.csv", res.csv);
      toast(fr ? `${res.total} commande(s) exportée(s)` : `${res.total} order(s) exported`);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setExporting(false);
    }
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("orders")}
        subtitle={
          fr
            ? "Commandes contenant vos produits. Marquez « colis prêt » depuis le détail de la commande. Sur une commande partagée, vous ne voyez et ne préparez que vos articles."
            : "Orders containing your products. Mark “package ready” from the order detail. On a shared order you only see and pack your own items."
        }
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("orders") }]}
        actions={
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? (fr ? "Export…" : "Exporting…") : fr ? "Exporter en CSV" : "Export CSV"}
          </button>
        }
      />

      {orders.error && <LoadError message={orders.error} onRetry={orders.reload} />}

      <ListFilters
        values={filters}
        onChange={change}
        statusOptions={statusOptions}
        searchPlaceholder={fr ? "N° commande, produit, prénom du client…" : "Order no., product, customer first name…"}
      />

      <Card>
        <CardContent className="p-0">
          {orders.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              columns={[
                {
                  key: "id",
                  label: fr ? "Commande" : "Order",
                  render: (row) => (
                    <div>
                      <Link href={`/seller/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                        {String(row.id)}
                      </Link>
                      {(row.sellerCount as number) > 1 && (
                        <p className="text-xs text-slate-500">
                          {fr ? `Commande partagée · ${row.sellerCount} vendeurs` : `Shared order · ${row.sellerCount} sellers`}
                        </p>
                      )}
                    </div>
                  ),
                },
                { key: "customer", label: t("customer") },
                { key: "city", label: fr ? "Ville" : "City" },
                { key: "items", label: fr ? "Articles" : "Items" },
                { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
                { key: "paymentMethod", label: fr ? "Paiement" : "Payment", render: (row) => paymentMethodLabel(String(row.paymentMethod), fr) },
                {
                  key: "packageStatus",
                  label: t("status"),
                  render: (row) => (
                    <div className="space-y-1">
                      <Badge variant={packageStatusVariant(String(row.packageStatus))}>{packageStatusLabel(String(row.packageStatus), fr)}</Badge>
                      {shippingStepLabel(String(row.step), fr) !== packageStatusLabel(String(row.packageStatus), fr) &&
                        ["rider_assigned", "picked_up", "at_hub", "transfer_pending", "in_transfer", "at_destination", "out_for_delivery", "delivery_failed"].includes(String(row.step)) && (
                          <p className="max-w-[12rem]">
                            <Badge variant={shippingStepVariant(String(row.step))} className="whitespace-normal text-left">
                              {shippingStepLabel(String(row.step), fr)}
                            </Badge>
                          </p>
                        )}
                    </div>
                  ),
                },
                { key: "date", label: t("date") },
                {
                  key: "actions",
                  label: t("action"),
                  render: (row) => (
                    <Link href={`/seller/orders/${row.id}`} className="text-xs text-[var(--primary)] hover:underline">
                      {t("view")}
                    </Link>
                  ),
                },
              ]}
              data={rows as unknown as Record<string, unknown>[]}
              emptyMessage={
                search || filters.status || filters.fromDate || filters.toDate
                  ? fr ? "Aucune commande ne correspond à ces filtres." : "No order matches these filters."
                  : fr
                    ? "Aucune commande pour le moment. Elles apparaissent ici dès qu'un client commande un de vos produits."
                    : "No orders yet. They appear here as soon as a customer orders one of your products."
              }
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <p aria-live="polite">
          {total === 0
            ? fr ? "0 commande" : "0 orders"
            : fr
              ? `${from}–${to} sur ${total} commande${total > 1 ? "s" : ""}`
              : `${from}–${to} of ${total} order${total === 1 ? "" : "s"}`}
          {orders.refreshing && <span className="ml-2 text-xs text-slate-400">{fr ? "mise à jour…" : "updating…"}</span>}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            {fr ? "Par page" : "Per page"}
            <select
              className="input-premium px-2 py-1 text-sm"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setOffset(0);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            {fr ? "Précédent" : "Previous"}
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => setOffset(offset + limit)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            {fr ? "Suivant" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
