"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getInventory } from "@/lib/warehouse-entities";
import { useToast } from "@/context/toast-context";

export default function WarehouseInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { toast } = useToast();
  const item = getInventory(decodeURIComponent(sku));

  if (!item) {
    return <div className="p-8 text-center text-slate-500">Inventory item not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.product}
        subtitle={`SKU: ${item.sku} · Location: ${item.location}`}
        backHref="/warehouse/inventory"
        breadcrumbs={[
          { label: "Warehouse", href: "/warehouse" },
          { label: "Inventory", href: "/warehouse/inventory" },
          { label: item.sku },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="relative aspect-square overflow-hidden rounded-xl lg:col-span-1">
          <Image src={item.image} alt={item.product} fill className="object-cover" />
        </div>

        <DetailGrid className="lg:col-span-3">
          <DetailGridSection title="Overview" span={2}>
            <InfoGrid items={[
              { label: "SKU", value: item.sku },
              { label: "Product", value: <Link href={`/shop/products/${item.productId}`} className="text-indigo-600 hover:underline">{item.product}</Link> },
              { label: "Category", value: item.category },
              { label: "Warehouse Location", value: item.location },
            ]} />
          </DetailGridSection>

          <DetailGridSection title="Related Navigation">
            <div className="flex flex-wrap gap-3">
              <Link href={`/shop/products/${item.productId}`} className="text-sm text-indigo-600 hover:underline">→ Product Detail</Link>
              <Link href="/warehouse/replacements" className="text-sm text-indigo-600 hover:underline">→ Replacement Cases</Link>
              <Link href="/warehouse/dispatch" className="text-sm text-indigo-600 hover:underline">→ Dispatches</Link>
            </div>
          </DetailGridSection>

          <DetailGridSection title="Quantities" span={3}>
            <InfoGrid columns={4} items={[
              { label: "Available", value: item.available },
              { label: "Reserved", value: item.reserved },
              { label: "Allocated", value: item.allocated },
              { label: "Damaged", value: item.damaged },
            ]} />
            <div className="mt-4 flex gap-2">
              <button onClick={() => toast(`Stock adjusted for ${item.sku}`)} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">Adjust Stock</button>
              <button onClick={() => toast(`Stock moved for ${item.sku}`, "info")} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">Move Stock</button>
              <button onClick={() => toast(`Stock reserved for ${item.sku}`, "info")} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">Reserve Stock</button>
            </div>
          </DetailGridSection>

          <DetailGridSection title="Movement History" span={3}>
            <ActivityTimeline events={item.movements.map((m) => ({
              time: m.time,
              label: `${m.label} (${m.qty > 0 ? "+" : ""}${m.qty})`,
              done: true,
            }))} />
          </DetailGridSection>
        </DetailGrid>
      </div>
    </div>
  );
}
