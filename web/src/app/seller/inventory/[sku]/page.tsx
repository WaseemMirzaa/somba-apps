"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { getSellerInventory } from "@/lib/seller-entities";
import { useToast } from "@/context/toast-context";

export default function SellerInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { toast } = useToast();
  const item = getSellerInventory(decodeURIComponent(sku));

  if (!item) {
    return <div className="p-8 text-center text-slate-500">Inventory not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.product}
        subtitle={`SKU: ${item.sku} · ${item.location}`}
        backHref="/seller/inventory"
        breadcrumbs={[
          { label: "Seller", href: "/seller" },
          { label: "Inventory", href: "/seller/inventory" },
          { label: item.sku },
        ]}
      />

      <DetailGrid>
        <DetailGridSection title="Overview">
          <InfoGrid items={[
            { label: "SKU", value: item.sku },
            { label: "Product", value: <Link href={`/seller/products/${item.productId}`} className="text-[var(--primary)] hover:underline">{item.product}</Link> },
            { label: "Warehouse", value: item.warehouse },
            { label: "Supplier", value: item.supplier },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Stock Summary">
          <InfoGrid columns={3} items={[
            { label: "Available", value: item.available },
            { label: "Reserved", value: item.reserved },
            { label: "Allocated", value: item.allocated },
            { label: "Sold", value: item.sold },
            { label: "Damaged", value: item.damaged },
            { label: "Returned", value: item.returned },
          ]} />
          <button onClick={() => toast(`Stock adjusted for ${item.sku}`)} className="mt-4 rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">Adjust Stock</button>
        </DetailGridSection>

        <DetailGridSection title="Related Navigation">
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/seller/products/${item.productId}`} className="text-[var(--primary)] hover:underline">→ Product Detail</Link>
            <Link href="/seller/orders" className="text-[var(--primary)] hover:underline">→ Orders</Link>
            <Link href="/seller/returns" className="text-[var(--primary)] hover:underline">→ Returns</Link>
            <Link href="/seller/replacements" className="text-[var(--primary)] hover:underline">→ Replacements</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title="Stock Movement History" span={3}>
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "type", label: "Type" },
              { key: "quantity", label: "Quantity" },
              { key: "reference", label: "Reference" },
              { key: "user", label: "User" },
            ]}
            data={item.movements as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
