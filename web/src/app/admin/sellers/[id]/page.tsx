"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { getSeller, orderEntities, sellerProductDetails } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { mapTimelineEvents, statusLabel, storeNameLabel } from "@/lib/locale-helpers";
import { useToast } from "@/context/toast-context";

export default function AdminSellerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const seller = getSeller(Number(id));

  if (!seller) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  const sellerOrders = orderEntities.filter((o) => o.sellerId === seller.id);
  const sellerProducts = sellerProductDetails.filter((p) => p.sellerId === seller.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={storeNameLabel(locale, seller.storeName, seller.storeNameFr)}
        subtitle={`${t("seller")}: ${seller.owner} · ${seller.city}, ${seller.country}`}
        backHref="/admin/sellers"
        breadcrumbs={[
          { label: t("adminBreadcrumb"), href: "/admin" },
          { label: t("sellers"), href: "/admin/sellers" },
          { label: seller.storeName },
        ]}
        actions={
          seller.status === "pending" ? (
            <>
              <button onClick={() => toast(t("approved"))} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">{t("approve")}</button>
              <button onClick={() => toast(t("rejected"))} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">{t("reject")}</button>
            </>
          ) : (
            <Badge variant="success">{statusLabel(locale, seller.status)}</Badge>
          )
        }
      />

      <DetailGrid>
        <DetailGridSection title={t("storeProfile")}>
          <InfoGrid items={[
            { label: t("store"), value: storeNameLabel(locale, seller.storeName, seller.storeNameFr) },
            { label: t("seller"), value: seller.owner },
            { label: t("email"), value: seller.email },
            { label: t("phone"), value: seller.phone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("address")}>
          <InfoGrid items={[
            { label: t("address"), value: seller.address, full: true },
            { label: t("city"), value: seller.city },
            { label: t("country"), value: seller.country },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("fulfillmentMetrics")}>
          <InfoGrid columns={3} items={[
            { label: t("orders"), value: seller.orders },
            { label: t("revenue"), value: formatCurrency(seller.revenue, locale) },
            { label: t("returns"), value: seller.returns },
            { label: t("cancellation"), value: seller.cancellations },
            { label: t("rating"), value: seller.rating > 0 ? `⭐ ${seller.rating}` : "—" },
            { label: t("storeHealthScore"), value: seller.healthScore > 0 ? `${seller.healthScore}%` : "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("finance")}>
          <InfoGrid columns={3} items={[
            { label: t("availableBalance"), value: formatCurrency(seller.availableBalance, locale) },
            { label: t("pending"), value: formatCurrency(seller.pendingBalance, locale) },
            { label: t("paid"), value: formatCurrency(seller.paidBalance, locale) },
            { label: t("commissionLabel"), value: `${seller.commission}%` },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("transaction")}>
          <InfoGrid items={[
            { label: t("availableBalance"), value: formatCurrency(seller.availableBalance, locale) },
            { label: t("pending"), value: formatCurrency(seller.pendingBalance, locale) },
            { label: t("paid"), value: formatCurrency(seller.paidBalance, locale) },
          ]} />
          <Link href="/admin/finance" className="mt-3 inline-block text-sm text-blue-600 hover:underline">{t("viewAll")} →</Link>
        </DetailGridSection>

        <DetailGridSection title={t("supportTicket")}>
          <p className="text-sm text-slate-500">{t("open")} · {t("supportTicket")}</p>
        </DetailGridSection>

        <DetailGridSection title={t("products")} span={3}>
          <DataTable
            columns={[
              { key: "name", label: t("products"), render: (row) => (
                <Link href={`/admin/products/${row.id}`} className="text-blue-600 hover:underline">{String(row.name)}</Link>
              )},
              { key: "sku", label: t("sku") },
              { key: "stock", label: t("stock") },
              { key: "sold", label: t("orders") },
              { key: "price", label: t("amount"), render: (row) => formatCurrency(row.price as number, locale) },
              { key: "status", label: t("status"), render: (row) => <Badge>{statusLabel(locale, String(row.status))}</Badge> },
            ]}
            data={(sellerProducts.length ? sellerProducts : [{ id: 0, name: t("notFound"), sku: "-", stock: 0, sold: 0, price: 0, status: "-" }]) as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title={t("orders")} span={3}>
          <DataTable
            columns={[
              { key: "id", label: t("orderId"), render: (row) => (
                <Link href={`/admin/orders/${row.id}`} className="text-blue-600 hover:underline">{String(row.id)}</Link>
              )},
              { key: "customer", label: t("name") },
              { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
              { key: "status", label: t("status"), render: (row) => <Badge variant="info">{statusLabel(locale, String(row.status))}</Badge> },
              { key: "date", label: t("date") },
            ]}
            data={sellerOrders as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title={t("auditLog")} span={3}>
          <ActivityTimeline events={mapTimelineEvents(locale, seller.timeline).map((e) => ({ ...e, done: true }))} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
