"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { getSellerInventory } from "@/lib/seller-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function SellerInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const item = getSellerInventory(decodeURIComponent(sku));

  if (!item) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Stock introuvable" : "Inventory not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.product}
        subtitle={`SKU: ${item.sku} · ${item.location}`}
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
            { label: fr ? "Entrepôt" : "Warehouse", value: item.warehouse },
            { label: fr ? "Fournisseur" : "Supplier", value: item.supplier },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Résumé du stock" : "Stock Summary"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Disponible" : "Available", value: item.available },
            { label: fr ? "Réservé" : "Reserved", value: item.reserved },
            { label: fr ? "Alloué" : "Allocated", value: item.allocated },
            { label: fr ? "Vendu" : "Sold", value: item.sold },
            { label: fr ? "Endommagé" : "Damaged", value: item.damaged },
            { label: fr ? "Retourné" : "Returned", value: item.returned },
          ]} />
          <button onClick={() => toast(fr ? `Stock ajusté pour ${item.sku}` : `Stock adjusted for ${item.sku}`)} className="mt-4 rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">{fr ? "Ajuster le stock" : "Adjust Stock"}</button>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Navigation associée" : "Related Navigation"}>
          <div className="flex flex-wrap gap-3 text-sm">
            <NavLinkButton href={`/seller/products/${item.productId}`}>{fr ? "→ Détail du produit" : "→ Product Detail"}</NavLinkButton>
            <NavLinkButton href="/seller/orders">{fr ? "→ Commandes" : "→ Orders"}</NavLinkButton>
            <NavLinkButton href="/seller/returns">{fr ? "→ Retours" : "→ Returns"}</NavLinkButton>
            <NavLinkButton href="/seller/replacements">{fr ? "→ Remplacements" : "→ Replacements"}</NavLinkButton>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Historique des mouvements de stock" : "Stock Movement History"} span={3}>
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "type", label: "Type", render: (row) => (fr ? String(row.typeFr ?? row.type) : String(row.type)) },
              { key: "quantity", label: fr ? "Quantité" : "Quantity" },
              { key: "reference", label: fr ? "Référence" : "Reference" },
              { key: "user", label: fr ? "Utilisateur" : "User" },
            ]}
            data={item.movements as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
