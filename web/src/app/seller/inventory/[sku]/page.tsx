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
  const { t } = useLocale();
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
            { label: t("roleWarehouse"), value: item.warehouse },
            { label: t("supplier"), value: item.supplier },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("stockSummary")}>
          <InfoGrid columns={3} items={[
            { label: t("available"), value: item.available },
            { label: t("reserved"), value: item.reserved },
            { label: t("allocated"), value: item.allocated },
            { label: t("sold"), value: item.sold },
            { label: t("damaged"), value: item.damaged },
            { label: t("returned"), value: item.returned },
          ]} />
          <button onClick={() => toast(`${t("stockAdjustedFor")} ${item.sku}`)} className="mt-4 rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">{t("adjustStock")}</button>
        </DetailGridSection>

        <DetailGridSection title={t("relatedNavigation")}>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/seller/products/${item.productId}`} className="text-sky-600 hover:underline">→ {t("productDetail")}</Link>
            <Link href="/seller/orders" className="text-sky-600 hover:underline">→ {t("orders")}</Link>
            <Link href="/seller/returns" className="text-sky-600 hover:underline">→ {t("returns")}</Link>
            <Link href="/seller/replacements" className="text-sky-600 hover:underline">→ {t("replacements")}</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title={t("stockMovementHistory")} span={3}>
          <DataTable
            columns={[
              { key: "date", label: t("date") },
              { key: "type", label: t("type") },
              { key: "quantity", label: t("quantity") },
              { key: "reference", label: t("reference") },
              { key: "user", label: t("user") },
            ]}
            data={item.movements as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
