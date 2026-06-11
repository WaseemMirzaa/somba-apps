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
import { useToast } from "@/context/toast-context";

export default function AdminSellerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const seller = getSeller(Number(id));

  if (!seller) {
    return <div className="p-8 text-center text-slate-500">Seller not found</div>;
  }

  const sellerOrders = orderEntities.filter((o) => o.sellerId === seller.id);
  const sellerProducts = sellerProductDetails.filter((p) => p.sellerId === seller.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={seller.storeName}
        subtitle={`Owner: ${seller.owner} · ${seller.city}, ${seller.country}`}
        backHref="/admin/sellers"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("sellers"), href: "/admin/sellers" },
          { label: seller.storeName },
        ]}
        actions={
          seller.status === "pending" ? (
            <>
              <button onClick={() => toast("Seller approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">{t("approve")}</button>
              <button onClick={() => toast("Seller rejected")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">{t("reject")}</button>
            </>
          ) : (
            <Badge variant="success">{t("approved")}</Badge>
          )
        }
      />

      <DetailGrid>
        <DetailGridSection title="Business">
          <InfoGrid items={[
            { label: "Store Name", value: seller.storeName },
            { label: "Owner", value: seller.owner },
            { label: t("email"), value: seller.email },
            { label: t("phone"), value: seller.phone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Address">
          <InfoGrid items={[
            { label: "Address", value: seller.address, full: true },
            { label: "City", value: seller.city },
            { label: "Country", value: seller.country },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Performance">
          <InfoGrid columns={3} items={[
            { label: "Orders", value: seller.orders },
            { label: "Revenue", value: formatCurrency(seller.revenue, locale) },
            { label: "Returns", value: seller.returns },
            { label: "Cancellations", value: seller.cancellations },
            { label: "Rating", value: seller.rating > 0 ? `⭐ ${seller.rating}` : "—" },
            { label: "Health Score", value: seller.healthScore > 0 ? `${seller.healthScore}%` : "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Finance">
          <InfoGrid columns={3} items={[
            { label: "Available Balance", value: formatCurrency(seller.availableBalance, locale) },
            { label: "Pending Balance", value: formatCurrency(seller.pendingBalance, locale) },
            { label: "Paid Balance", value: formatCurrency(seller.paidBalance, locale) },
            { label: "Commission Rate", value: `${seller.commission}%` },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Balance & Transactions">
          <InfoGrid items={[
            { label: "Available", value: formatCurrency(seller.availableBalance, locale) },
            { label: "Pending", value: formatCurrency(seller.pendingBalance, locale) },
            { label: "Total Paid", value: formatCurrency(seller.paidBalance, locale) },
          ]} />
          <Link href="/admin/finance" className="mt-3 inline-block text-sm text-blue-600 hover:underline">View all transactions →</Link>
        </DetailGridSection>

        <DetailGridSection title="Support Tickets">
          <p className="text-sm text-slate-500">No open tickets for this seller.</p>
        </DetailGridSection>

        <DetailGridSection title="Seller Products" span={3}>
          <DataTable
            columns={[
              { key: "name", label: "Product", render: (row) => (
                <Link href={`/admin/products/${row.id}`} className="text-blue-600 hover:underline">{String(row.name)}</Link>
              )},
              { key: "sku", label: "SKU" },
              { key: "stock", label: "Stock" },
              { key: "sold", label: "Sold" },
              { key: "price", label: "Price", render: (row) => formatCurrency(row.price as number, locale) },
              { key: "status", label: t("status"), render: (row) => <Badge>{String(row.status)}</Badge> },
            ]}
            data={(sellerProducts.length ? sellerProducts : [{ id: 0, name: "No products", sku: "-", stock: 0, sold: 0, price: 0, status: "-" }]) as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title="Seller Orders" span={3}>
          <DataTable
            columns={[
              { key: "id", label: "Order ID", render: (row) => (
                <Link href={`/admin/orders/${row.id}`} className="text-blue-600 hover:underline">{String(row.id)}</Link>
              )},
              { key: "customer", label: t("name") },
              { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
              { key: "status", label: t("status"), render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
              { key: "date", label: t("date") },
            ]}
            data={sellerOrders as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title="Audit Log" span={3}>
          <ActivityTimeline events={seller.timeline.map((e) => ({ ...e, done: true }))} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
