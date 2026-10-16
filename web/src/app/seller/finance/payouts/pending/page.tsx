"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Clock, Wallet, Percent } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useSellerData } from "@/lib/seller";
import type { SellerPayoutItemStatus } from "@/lib/seller";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const STATUS_LABELS: Record<SellerPayoutItemStatus, { en: string; fr: string }> = {
  awaiting_delivery: { en: "Awaiting confirmation", fr: "En attente de confirmation" },
  pending_clearance: { en: "In delivery", fr: "En cours de livraison" },
  ready_for_payout: { en: "Delivered (earned)", fr: "Livrée (gagnée)" },
  paid_out: { en: "Paid out", fr: "Versé" },
};

const STATUS_OPTIONS = (["awaiting_delivery", "pending_clearance", "ready_for_payout"] as const).map((value) => ({
  value,
  label: STATUS_LABELS[value].en,
  labelFr: STATUS_LABELS[value].fr,
}));

function statusBadgeVariant(status: SellerPayoutItemStatus) {
  switch (status) {
    case "ready_for_payout":
      return "success" as const;
    case "pending_clearance":
      return "info" as const;
    default:
      return "warning" as const;
  }
}

export default function SellerPayoutPendingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerPayoutSummary, getSellerPayoutItems } = useSellerData();
  const summary = sellerPayoutSummary;
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const items = getSellerPayoutItems();

  const filtered = useMemo(
    () =>
      applyListFilters(items, filters, {
        searchFields: ["orderId", "listingName", "id"],
        dateField: "deliveryDate",
        statusField: "status",
      }),
    [items, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Gains par commande" : "Earnings per order"}
        subtitle={
          fr
            ? "Chaque commande et ce qu'elle rapporte une fois livrée"
            : "Every order and what it earns once delivered"
        }
        backHref="/seller/finance/payouts"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("finance"), href: "/seller/finance" },
          { label: t("payouts"), href: "/seller/finance/payouts" },
          { label: fr ? "Gains" : "Earnings" },
        ]}
        actions={
          <Link
            href="/seller/finance/payouts/request"
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium"
          >
            {t("requestPayout")}
          </Link>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {fr
          ? `Seules les commandes livrées comptent dans votre solde disponible (commission ${summary.commissionPct} % déduite). Les versements demandés sont prélevés sur ce solde global.`
          : `Only delivered orders count toward your available balance (${summary.commissionPct}% commission deducted). Payouts you request draw on that overall balance.`}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={fr ? "En cours de livraison (net)" : "In delivery (net)"}
          value={formatCurrency(summary.totalPending, locale)}
          icon={Clock}
        />
        <StatCard
          title={fr ? "Disponible pour versement" : "Available for payout"}
          value={formatCurrency(summary.availableForPayout, locale)}
          icon={Wallet}
        />
        <StatCard
          title={fr ? "Commissions sur vos commandes" : "Commission on your orders"}
          value={formatCurrency(summary.commissionDeducted, locale)}
          icon={Percent}
        />
      </div>

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "N° commande, annonce…" : "Order ID, listing name…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "orderId",
                label: fr ? "Commande" : "Order ID",
                render: (row) => (
                  <Link href={`/seller/orders/${row.orderId}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.orderId)}
                  </Link>
                ),
              },
              {
                key: "listingName",
                label: fr ? "Annonce / produit" : "Listing",
                render: (row) => (
                  <Link href={`/seller/products/${row.productId}`} className="text-[var(--primary)] hover:underline">
                    {String(row.listingName)}
                  </Link>
                ),
              },
              {
                key: "deliveryDate",
                label: fr ? "Date de commande" : "Order date",
                render: (row) => (row.deliveryDate ? String(row.deliveryDate) : "—"),
              },
              { key: "orderAmount", label: fr ? "Montant commande" : "Order amount", render: (row) => formatCurrency(row.orderAmount as number, locale) },
              { key: "commission", label: "Commission", render: (row) => formatCurrency(row.commission as number, locale) },
              { key: "netEarnings", label: fr ? "Gains nets" : "Net earnings", render: (row) => formatCurrency(row.netEarnings as number, locale) },
              {
                key: "status",
                label: t("status"),
                render: (row) => {
                  const status = row.status as SellerPayoutItemStatus;
                  return <Badge variant={statusBadgeVariant(status)}>{fr ? STATUS_LABELS[status].fr : STATUS_LABELS[status].en}</Badge>;
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
