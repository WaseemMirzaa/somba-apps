"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Clock, Wallet, Calendar, Percent } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import {
  sellerPayoutSummary,
  getPendingPayoutItems,
  getPaidOutPayoutItems,
  type SellerPayoutItemStatus,
} from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const STATUS_OPTIONS = [
  { value: "awaiting_delivery", label: "Awaiting delivery", labelFr: "En attente de livraison" },
  { value: "pending_clearance", label: "Pending clearance", labelFr: "Délai de sécurisation" },
  { value: "ready_for_payout", label: "Ready for payout", labelFr: "Prêt pour versement" },
  { value: "paid_out", label: "Paid out", labelFr: "Versé" },
];

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

export default function SellerPayoutPendingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const summary = sellerPayoutSummary;
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const sourceItems = tab === "pending" ? getPendingPayoutItems() : getPaidOutPayoutItems();

  const filtered = useMemo(
    () =>
      applyListFilters(sourceItems, filters, {
        searchFields: ["orderId", "listingName", "id"],
        dateField: "deliveryDate",
        statusField: "status",
      }),
    [sourceItems, filters]
  );

  const tabs = [
    { id: "pending", label: fr ? "En attente" : "Pending items" },
    { id: "paid", label: fr ? "Versés" : "Paid out" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Détail des versements" : "Payout Breakdown"}
        subtitle={
          fr
            ? "Commandes et annonces en attente vs déjà versées"
            : "Orders and listings awaiting payout vs already paid out"
        }
        backHref="/seller/finance/payouts"
        breadcrumbs={[
          { label: "Seller", href: "/seller" },
          { label: t("finance"), href: "/seller/finance" },
          { label: t("payouts"), href: "/seller/finance/payouts" },
          { label: fr ? "Détail" : "Breakdown" },
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
          ? `Les gains sont versés après confirmation de livraison et réconciliation entrepôt, puis un délai de sécurisation de ${summary.clearanceHours}h.`
          : `Earnings accrue after delivery confirmation and warehouse reconciliation, then a ${summary.clearanceHours}h clearance period.`}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={fr ? "Total en attente" : "Total pending"}
          value={formatCurrency(summary.totalPending, locale)}
          icon={Clock}
        />
        <StatCard
          title={fr ? "Disponible pour versement" : "Available for payout"}
          value={formatCurrency(summary.availableForPayout, locale)}
          icon={Wallet}
        />
        <StatCard
          title={fr ? "Prochain versement" : "Next payout date"}
          value={summary.nextPayoutDate}
          icon={Calendar}
        />
        <StatCard
          title={fr ? "Commissions déduites" : "Commission deducted"}
          value={formatCurrency(summary.commissionDeducted, locale)}
          icon={Percent}
        />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as "pending" | "paid")} />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={tab === "pending" ? STATUS_OPTIONS.filter((o) => o.value !== "paid_out") : STATUS_OPTIONS.filter((o) => o.value === "paid_out")}
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
                render: (row) =>
                  row.deliveryDate
                    ? String(row.deliveryDate)
                    : fr
                      ? "—"
                      : "—",
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
              {
                key: "payoutId",
                label: fr ? "Versement" : "Payout",
                render: (row) =>
                  row.payoutId ? (
                    <Link
                      href={`/seller/finance/payouts/${row.payoutId}`}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      {String(row.payoutId)}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  ),
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
