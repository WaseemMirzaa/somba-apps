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
import { useLocale } from "@/context/locale-context";
import { L } from "@/lib/locale-helpers";

export default function WarehouseInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const item = getInventory(decodeURIComponent(sku));

  if (!item) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.product}
        subtitle={`SKU: ${item.sku} · ${L(locale, "Location", "Emplacement")}: ${item.location}`}
        backHref="/warehouse/inventory"
        breadcrumbs={[
          { label: t("warehouseBreadcrumb"), href: "/warehouse" },
          { label: t("inventory"), href: "/warehouse/inventory" },
          { label: item.sku },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="relative aspect-square overflow-hidden rounded-xl lg:col-span-1">
          <Image src={item.image} alt={item.product} fill className="object-cover" />
        </div>

        <DetailGrid className="lg:col-span-3">
          <DetailGridSection title={t("overview")} span={2}>
            <InfoGrid items={[
              { label: "SKU", value: item.sku },
              { label: L(locale, "Product", "Produit"), value: <Link href={`/shop/products/${item.productId}`} className="text-indigo-600 hover:underline">{item.product}</Link> },
              { label: L(locale, "Category", "Catégorie"), value: item.category },
              { label: L(locale, "Warehouse Location", "Emplacement entrepôt"), value: item.location },
            ]} />
          </DetailGridSection>

          <DetailGridSection title={L(locale, "Related Navigation", "Navigation associée")}>
            <div className="flex flex-wrap gap-3">
              <Link href={`/shop/products/${item.productId}`} className="text-sm text-indigo-600 hover:underline">→ {L(locale, "Product Detail", "Détail produit")}</Link>
              <Link href="/warehouse/replacements" className="text-sm text-indigo-600 hover:underline">→ {L(locale, "Replacement Cases", "Cas de remplacement")}</Link>
              <Link href="/warehouse/dispatch" className="text-sm text-indigo-600 hover:underline">→ {L(locale, "Dispatches", "Expéditions")}</Link>
            </div>
          </DetailGridSection>

          <DetailGridSection title={L(locale, "Quantities", "Quantités")} span={3}>
            <InfoGrid columns={4} items={[
              { label: L(locale, "Available", "Disponible"), value: item.available },
              { label: L(locale, "Reserved", "Réservé"), value: item.reserved },
              { label: L(locale, "Allocated", "Alloué"), value: item.allocated },
              { label: L(locale, "Damaged", "Endommagé"), value: item.damaged },
            ]} />
            <div className="mt-4 flex gap-2">
              <button onClick={() => toast(L(locale, `Stock adjusted for ${item.sku}`, `Stock ajusté pour ${item.sku}`))} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{L(locale, "Adjust Stock", "Ajuster stock")}</button>
              <button onClick={() => toast(L(locale, `Stock moved for ${item.sku}`, `Stock déplacé pour ${item.sku}`), "info")} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{L(locale, "Move Stock", "Déplacer stock")}</button>
              <button onClick={() => toast(L(locale, `Stock reserved for ${item.sku}`, `Stock réservé pour ${item.sku}`), "info")} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{L(locale, "Reserve Stock", "Réserver stock")}</button>
            </div>
          </DetailGridSection>

          <DetailGridSection title={L(locale, "Movement History", "Historique mouvements")} span={3}>
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
