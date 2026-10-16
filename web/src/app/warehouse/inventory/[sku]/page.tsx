"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useWarehouseData } from "@/lib/warehouse";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { useLocale } from "@/context/locale-context";

export default function WarehouseInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { inventory, inventoryLoading } = useWarehouseData();
  const decoded = decodeURIComponent(sku);
  const item = inventory.find((i) => i.sku === decoded);

  if (!item) {
    return (
      <div className="p-8 text-center text-slate-500">
        {inventoryLoading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Article d'inventaire introuvable" : "Inventory item not found")}
      </div>
    );
  }

  const listHref = ops("/inventory");
  return (
    <div className="space-y-6">
      <PageHeader
        title={item.name}
        subtitle={`SKU: ${item.sku}`}
        backHref={listHref}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Inventaire" : "Inventory", href: listHref },
          { label: item.sku },
        ]}
        actions={<Badge variant={item.status === "ok" ? "success" : item.status === "low" ? "warning" : "danger"}>{item.status}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"} span={2}>
          <InfoGrid items={[
            { label: "SKU", value: item.sku },
            { label: fr ? "Produit" : "Product", value: item.name },
            { label: fr ? "Catégorie" : "Category", value: item.category },
            { label: fr ? "Stock disponible" : "Available stock", value: item.stock },
          ]} />
        </DetailGridSection>
        <DetailGridSection title={fr ? "Remarque" : "Note"}>
          <p className="text-sm text-slate-600">
            {fr
              ? "Le stock est géré par les vendeurs (création et modification des annonces). Il n'y a pas d'ajustement, de déplacement ni de réservation depuis l'entrepôt."
              : "Stock is managed by sellers through their listings. The warehouse cannot adjust, move or reserve stock from here."}
          </p>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
