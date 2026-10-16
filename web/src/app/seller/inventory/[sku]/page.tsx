"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { StockAdjust } from "@/components/seller/stock-adjust";
import { useSellerData } from "@/lib/seller";
import { useLocale } from "@/context/locale-context";

export default function SellerInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { getSellerInventory } = useSellerData();
  const item = getSellerInventory(decodeURIComponent(sku));

  if (!item) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Stock introuvable" : "Inventory not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.product}
        subtitle={`SKU: ${item.sku}`}
        backHref="/seller/inventory"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: fr ? "Stock" : "Inventory", href: "/seller/inventory" },
          { label: item.sku },
        ]}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid items={[
            { label: "SKU", value: item.sku },
            { label: fr ? "Produit" : "Product", value: <Link href={`/seller/products/${item.productId}`} className="text-[var(--primary)] hover:underline">{item.product}</Link> },
            { label: fr ? "Catégorie" : "Category", value: fr ? item.categoryFr : item.category },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Résumé du stock" : "Stock Summary"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Disponible" : "Available", value: item.available },
            { label: fr ? "En livraison" : "In fulfilment", value: item.reserved },
            { label: fr ? "Vendu" : "Sold", value: item.sold },
          ]} />
          <div className="mt-4">
            <StockAdjust productId={item.productId} current={item.available} />
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Navigation associée" : "Related Navigation"}>
          <div className="flex flex-wrap gap-3 text-sm">
            <NavLinkButton href={`/seller/products/${item.productId}`}>{fr ? "→ Détail du produit" : "→ Product Detail"}</NavLinkButton>
            <NavLinkButton href="/seller/orders">{fr ? "→ Commandes" : "→ Orders"}</NavLinkButton>
            <NavLinkButton href="/seller/returns">{fr ? "→ Retours" : "→ Returns"}</NavLinkButton>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Ventes (mouvements de stock réels)" : "Sales (real stock movements)"} span={3}>
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "type", label: "Type", render: (row) => (fr ? String(row.typeFr ?? row.type) : String(row.type)) },
              { key: "quantity", label: fr ? "Quantité" : "Quantity" },
              { key: "reference", label: fr ? "Commande" : "Order", render: (row) => (
                <Link href={`/seller/orders/${row.reference}`} className="text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
              )},
            ]}
            data={item.movements as unknown as Record<string, unknown>[]}
          />
          <p className="mt-3 text-xs text-slate-500">
            {fr ? "Les entrées de stock sont des ajustements manuels : seules les ventes sont historisées." : "Stock additions are manual adjustments: only sales are logged."}
          </p>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
