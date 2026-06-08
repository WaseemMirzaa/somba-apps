"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { getSellerProductFull } from "@/lib/seller-entities";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const product = getSellerProductFull(Number(id));

  if (!product) {
    return <div className="p-8 text-center text-slate-500">Product not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={`SKU: ${product.sku} · ${product.status}`}
        backHref="/seller/products"
        breadcrumbs={[
          { label: "Seller", href: "/seller" },
          { label: t("products"), href: "/seller/products" },
          { label: product.name },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href="/seller/products/create" className="rounded-lg border border-sky-200 px-4 py-2 text-sm">Edit</Link>
            <Badge variant={product.status === "live" ? "success" : "warning"}>{String(product.status)}</Badge>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="relative aspect-square overflow-hidden rounded-xl lg:col-span-1">
          <Image src={product.image} alt={product.name} fill className="object-cover" />
        </div>

        <DetailGrid className="lg:col-span-3">
          <DetailGridSection title="Product Information" span={3}>
            <InfoGrid items={[
              { label: "Product ID", value: product.id },
              { label: "SKU", value: product.sku },
              { label: "Category", value: product.category },
              { label: "Subcategory", value: product.subcategory },
              { label: "Brand", value: product.brand },
              { label: "Created", value: product.createdDate },
              { label: "Updated", value: product.updatedDate },
              { label: "Description", value: product.description, full: true },
            ]} />
          </DetailGridSection>

          <DetailGridSection title="Stock">
            <InfoGrid columns={3} items={[
              { label: "Available", value: product.availableStock },
              { label: "Reserved", value: product.reservedStock },
              { label: "Allocated", value: product.allocatedStock },
              { label: "Sold", value: product.soldCount },
              { label: "Low Stock Threshold", value: product.lowStockThreshold },
            ]} />
            <div className="mt-4 flex gap-2">
              <Link href={`/seller/inventory/${encodeURIComponent(product.sku)}`} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white">View Inventory</Link>
            </div>
          </DetailGridSection>

          <DetailGridSection title="Pricing">
            <InfoGrid items={[
              { label: "MRP", value: formatCurrency(product.mrp, locale) },
              { label: "Sale Price", value: formatCurrency(product.price, locale) },
              { label: "Discount Price", value: formatCurrency(product.discountPrice, locale) },
              { label: "Commission", value: `${product.commission}%` },
              { label: "Net Revenue", value: formatCurrency(product.netRevenue, locale) },
            ]} />
          </DetailGridSection>

          <DetailGridSection title="Analytics">
            <InfoGrid columns={3} items={[
              { label: "Views", value: formatNumber(product.views, locale) },
              { label: "Add to Cart", value: product.addToCart },
              { label: "Wishlist", value: product.wishlist },
              { label: "Conversion Rate", value: `${((product.orders / product.views) * 100).toFixed(1)}%` },
              { label: "Revenue", value: formatCurrency(product.revenue, locale) },
              { label: "Orders", value: product.orders },
            ]} />
          </DetailGridSection>

          <DetailGridSection title="Variants" span={3}>
            <DataTable
              columns={[
                { key: "variantName", label: "Variant" },
                { key: "sku", label: "SKU" },
                { key: "color", label: "Color" },
                { key: "size", label: "Size" },
                { key: "price", label: "Price", render: (row) => formatCurrency(row.price as number, locale) },
                { key: "stock", label: "Stock" },
                { key: "status", label: t("status"), render: (row) => <Badge>{String(row.status)}</Badge> },
              ]}
              data={product.variantsDetailed as unknown as Record<string, unknown>[]}
            />
          </DetailGridSection>

          <DetailGridSection title="Orders" span={3}>
            <DataTable
              columns={[
                { key: "orderNumber", label: "Order", render: (row) => (
                  <Link href={`/seller/orders/${row.orderNumber}`} className="text-sky-600 hover:underline">{String(row.orderNumber)}</Link>
                )},
                { key: "customer", label: "Customer" },
                { key: "quantity", label: "Qty" },
                { key: "amount", label: "Amount", render: (row) => formatCurrency(row.amount as number, locale) },
                { key: "status", label: t("status"), render: (row) => <Badge>{String(row.status)}</Badge> },
                { key: "date", label: t("date") },
              ]}
              data={product.productOrders as unknown as Record<string, unknown>[]}
            />
          </DetailGridSection>

          <DetailGridSection title="Reviews" span={3}>
            {product.productReviews.map((r, i) => (
              <div key={i} className="mb-4 border-b border-[var(--border)] pb-4 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.customer}</span>
                  <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{r.review}</p>
              </div>
            ))}
          </DetailGridSection>
        </DetailGrid>
      </div>
    </div>
  );
}
