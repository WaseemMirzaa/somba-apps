"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { getSellerInventory } from "@/lib/seller-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function SellerInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { toast } = useToast();
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const item = getSellerInventory(decodeURIComponent(sku));

  if (!item) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.product}
        subtitle={`SKU: ${item.sku} · ${item.location}`}
        backHref="/seller/inventory"
        breadcrumbs={[
          { label: t("seller"), href: "/seller" },
          { label: t("inventory"), href: "/seller/inventory" },
          { label: item.sku },
        ]}
      />

      <DetailGrid>
        <DetailGridSection title={t("overview")}>
          <InfoGrid items={[
            { label: "SKU", value: item.sku },
            { label: t("products"), value: <Link href={`/seller/products/${item.productId}`} className="text-sky-600 hover:underline">{item.product}</Link> },
            { label: fr ? "Entrepôt" : "Warehouse", value: item.warehouse },
            { label: fr ? "Fournisseur" : "Supplier", value: item.supplier },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Résumé stock" : "Stock Summary"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Disponible" : "Available", value: item.available },
            { label: fr ? "Réservé" : "Reserved", value: item.reserved },
            { label: fr ? "Alloué" : "Allocated", value: item.allocated },
            { label: fr ? "Vendu" : "Sold", value: item.sold },
            { label: fr ? "Endommagé" : "Damaged", value: item.damaged },
            { label: fr ? "Retourné" : "Returned", value: item.returned },
          ]} />
          <button onClick={() => toast(fr ? `Stock ajusté pour ${item.sku}` : `Stock adjusted for ${item.sku}`)} className="mt-4 rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">{fr ? "Ajuster stock" : "Adjust Stock"}</button>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Navigation" : "Related Navigation"}>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/seller/products/${item.productId}`} className="text-sky-600 hover:underline">→ {fr ? "Détail produit" : "Product Detail"}</Link>
            <Link href="/seller/orders" className="text-sky-600 hover:underline">→ {t("orders")}</Link>
            <Link href="/seller/returns" className="text-sky-600 hover:underline">→ {t("returns")}</Link>
            <Link href="/seller/replacements" className="text-sky-600 hover:underline">→ {t("replacements")}</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Historique mouvements" : "Stock Movement History"} span={3}>
          <DataTable
            columns={[
              { key: "date", label: t("date") },
              { key: "type", label: t("type") },
              { key: "quantity", label: fr ? "Quantité" : "Quantity" },
              { key: "reference", label: t("reference") },
              { key: "user", label: fr ? "Utilisateur" : "User" },
            ]}
            data={item.movements as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
