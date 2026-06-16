"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getInventory } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const item = getInventory(decodeURIComponent(sku));

  if (!item) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Article d'inventaire introuvable" : "Inventory item not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.product}
        subtitle={`SKU: ${item.sku} · ${fr ? "Emplacement" : "Location"}: ${item.location}`}
        backHref="/warehouse/inventory"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: fr ? "Inventaire" : "Inventory", href: "/warehouse/inventory" },
          { label: item.sku },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="relative aspect-square overflow-hidden rounded-xl lg:col-span-1">
          <Image src={item.image} alt={item.product} fill className="object-cover" />
        </div>

        <DetailGrid className="lg:col-span-3">
          <DetailGridSection title={fr ? "Aperçu" : "Overview"} span={2}>
            <InfoGrid items={[
              { label: "SKU", value: item.sku },
              { label: fr ? "Produit" : "Product", value: <Link href={`/shop/products/${item.productId}`} className="text-[var(--primary)] hover:underline">{item.product}</Link> },
              { label: fr ? "Catégorie" : "Category", value: fr ? item.categoryFr : item.category },
              { label: fr ? "Emplacement entrepôt" : "Warehouse Location", value: item.location },
            ]} />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Navigation liée" : "Related Navigation"}>
            <div className="flex flex-wrap gap-3">
              <Link href={`/shop/products/${item.productId}`} className="text-sm text-[var(--primary)] hover:underline">{fr ? "→ Détail du produit" : "→ Product Detail"}</Link>
              <Link href="/warehouse/replacements" className="text-sm text-[var(--primary)] hover:underline">{fr ? "→ Cas de remplacement" : "→ Replacement Cases"}</Link>
              <Link href="/warehouse/dispatch" className="text-sm text-[var(--primary)] hover:underline">{fr ? "→ Expéditions" : "→ Dispatches"}</Link>
            </div>
          </DetailGridSection>

          <DetailGridSection title={fr ? "Quantités" : "Quantities"} span={3}>
            <InfoGrid columns={4} items={[
              { label: fr ? "Disponible" : "Available", value: item.available },
              { label: fr ? "Réservé" : "Reserved", value: item.reserved },
              { label: fr ? "Alloué" : "Allocated", value: item.allocated },
              { label: fr ? "Endommagé" : "Damaged", value: item.damaged },
            ]} />
            <div className="mt-4 flex gap-2">
              <button onClick={() => toast(fr ? `Stock ajusté pour ${item.sku}` : `Stock adjusted for ${item.sku}`)} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{fr ? "Ajuster le stock" : "Adjust Stock"}</button>
              <button onClick={() => toast(fr ? `Stock déplacé pour ${item.sku}` : `Stock moved for ${item.sku}`, "info")} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{fr ? "Déplacer le stock" : "Move Stock"}</button>
              <button onClick={() => toast(fr ? `Stock réservé pour ${item.sku}` : `Stock reserved for ${item.sku}`, "info")} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{fr ? "Réserver le stock" : "Reserve Stock"}</button>
            </div>
          </DetailGridSection>

          <DetailGridSection title={fr ? "Historique des mouvements" : "Movement History"} span={3}>
            <ActivityTimeline events={item.movements.map((m) => ({
              time: m.time,
              label: `${fr ? m.labelFr : m.label} (${m.qty > 0 ? "+" : ""}${m.qty})`,
              done: true,
            }))} />
          </DetailGridSection>
        </DetailGrid>
      </div>
    </div>
  );
}
