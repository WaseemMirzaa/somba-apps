"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import {
  getPayout,
  getPayoutItemsByPayoutId,
  type SellerPayoutItemStatus,
} from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const STATUS_LABELS: Record<SellerPayoutItemStatus, { en: string; fr: string }> = {
  awaiting_delivery: { en: "Awaiting delivery", fr: "En attente de livraison" },
  pending_clearance: { en: "Pending clearance", fr: "Délai de sécurisation" },
  ready_for_payout: { en: "Ready for payout", fr: "Prêt pour versement" },
  paid_out: { en: "Paid out", fr: "Versé" },
};

function statusBadgeVariant(status: SellerPayoutItemStatus) {
  switch (status) {
    case "paid_out":
      return "success" as const;
    case "ready_for_payout":
      return "primary" as const;
    case "pending_clearance":
      return "info" as const;
    default:
      return "warning" as const;
  }
}

export default function SellerPayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const payout = getPayout(id);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const items = useMemo(() => getPayoutItemsByPayoutId(id), [id]);

  const filtered = useMemo(
    () =>
      applyListFilters(items, filters, {
        searchFields: ["orderId", "listingName"],
        dateField: "deliveryDate",
      }),
    [items, filters]
  );

  if (!payout) {
    return (
      <div className="p-8 text-center text-slate-500">
        {fr ? "Versement introuvable" : "Payout not found"}
      </div>
    );
  }

  const itemTotal = items.reduce((sum, i) => sum + i.netEarnings, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={payout.id}
        subtitle={`${formatCurrency(payout.amount, locale)} · ${fr ? (payout.statusFr ?? payout.status) : payout.status}`}
        backHref="/seller/finance/payouts"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("finance"), href: "/seller/finance" },
          { label: t("payouts"), href: "/seller/finance/payouts" },
          { label: payout.id },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/seller/finance/payouts/pending"
              className="text-sm text-[var(--primary)] hover:underline"
            >
              {fr ? "Voir tous les éléments en attente" : "See all pending items"}
            </Link>
            <Badge variant={payout.status === "paid" ? "success" : "warning"}>{fr ? (payout.statusFr ?? payout.status) : payout.status}</Badge>
          </div>
        }
      />

      <DetailSection title={fr ? "Détails du versement" : "Payout Details"}>
        <InfoGrid
          items={[
            { label: fr ? "N° demande" : "Request ID", value: payout.id },
            { label: t("amount"), value: formatCurrency(payout.amount, locale) },
            { label: fr ? "Compte bancaire" : "Bank Account", value: payout.bankAccount },
            { label: fr ? "Méthode" : "Method", value: fr ? (payout.methodFr ?? payout.method) : payout.method },
            { label: fr ? "Approuvé par" : "Approved By", value: payout.approvedBy },
            { label: t("status"), value: fr ? (payout.statusFr ?? payout.status) : payout.status },
            { label: t("date"), value: payout.date },
            {
              label: fr ? "Articles inclus" : "Items included",
              value: `${payout.itemCount ?? items.length} · ${formatCurrency(itemTotal, locale)} net`,
            },
          ]}
        />
      </DetailSection>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {fr ? "Répartition par commande" : "Order breakdown"}
          </h2>
          <Link
            href="/seller/finance/payouts/pending"
            className="text-sm font-medium text-[var(--primary)] hover:underline"
          >
            {fr ? "Voir le détail complet →" : "View full breakdown →"}
          </Link>
        </div>

        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={[]}
          showStatusFilter={false}
          searchPlaceholder={fr ? "N° commande, annonce…" : "Order ID, listing name…"}
        />

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                {fr
                  ? "Aucune commande associée à ce versement."
                  : "No orders linked to this payout yet."}
              </p>
            ) : (
              <DataTable
                columns={[
                  {
                    key: "orderId",
                    label: fr ? "Commande" : "Order ID",
                    render: (row) => (
                      <Link
                        href={`/seller/orders/${row.orderId}`}
                        className="font-medium text-[var(--primary)] hover:underline"
                      >
                        {String(row.orderId)}
                      </Link>
                    ),
                  },
                  {
                    key: "listingName",
                    label: fr ? "Annonce / produit" : "Listing",
                    render: (row) => (
                      <Link
                        href={`/seller/products/${row.productId}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        {String(row.listingName)}
                      </Link>
                    ),
                  },
                  {
                    key: "deliveryDate",
                    label: fr ? "Date de livraison" : "Delivery date",
                    render: (row) => (row.deliveryDate ? String(row.deliveryDate) : "—"),
                  },
                  {
                    key: "orderAmount",
                    label: fr ? "Montant commande" : "Order amount",
                    render: (row) => formatCurrency(row.orderAmount as number, locale),
                  },
                  {
                    key: "commission",
                    label: fr ? "Commission" : "Commission",
                    render: (row) => formatCurrency(row.commission as number, locale),
                  },
                  {
                    key: "netEarnings",
                    label: fr ? "Gains nets" : "Net earnings",
                    render: (row) => formatCurrency(row.netEarnings as number, locale),
                  },
                  {
                    key: "status",
                    label: t("status"),
                    render: (row) => {
                      const status = row.status as SellerPayoutItemStatus;
                      const label = fr ? STATUS_LABELS[status].fr : STATUS_LABELS[status].en;
                      return <Badge variant={statusBadgeVariant(status)}>{label}</Badge>;
                    },
                  },
                ]}
                data={filtered as unknown as Record<string, unknown>[]}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
