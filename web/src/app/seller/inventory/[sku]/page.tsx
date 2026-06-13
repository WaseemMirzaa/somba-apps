"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { getSellerInventory } from "@/lib/seller-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const item = getSellerInventory(decodeURIComponent(sku));

  const [available, setAvailable] = useState(item?.available ?? 0);
  const [movements, setMovements] = useState<Array<Record<string, unknown>>>(
    (item?.movements ?? []) as Array<Record<string, unknown>>
  );
  const [showAdjust, setShowAdjust] = useState(false);
  const [delta, setDelta] = useState("");

  if (!item) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Inventaire introuvable" : "Inventory not found"}</div>;
  }

  function applyAdjust() {
    const d = Number(delta) || 0;
    if (d === 0) { toast(fr ? "Saisissez une quantité" : "Enter a quantity", "error"); return; }
    setAvailable((a) => a + d);
    setMovements((m) => [
      { date: fr ? "À l'instant" : "Just now", type: fr ? "Ajustement" : "Adjustment", quantity: `${d > 0 ? "+" : ""}${d}`, reference: fr ? "Manuel" : "Manual", user: "You" },
      ...m,
    ]);
    toast(fr ? `Stock ajusté de ${d > 0 ? "+" : ""}${d}` : `Stock adjusted by ${d > 0 ? "+" : ""}${d}`);
    setShowAdjust(false);
    setDelta("");
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
            { label: "Product", value: <Link href={`/seller/products/${item.productId}`} className="text-sky-600 hover:underline">{item.product}</Link> },
            { label: "Warehouse", value: item.warehouse },
            { label: "Supplier", value: item.supplier },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Stock Summary">
          <InfoGrid columns={3} items={[
            { label: fr ? "Disponible" : "Available", value: available },
            { label: fr ? "Réservé" : "Reserved", value: item.reserved },
            { label: fr ? "Alloué" : "Allocated", value: item.allocated },
            { label: fr ? "Vendu" : "Sold", value: item.sold },
            { label: fr ? "Endommagé" : "Damaged", value: item.damaged },
            { label: fr ? "Retourné" : "Returned", value: item.returned },
          ]} />
          {showAdjust ? (
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-sky-100 bg-sky-50/50 p-3">
              <div>
                <label className="text-xs text-slate-500">{fr ? "Delta (+/-)" : "Delta (+/-)"}</label>
                <input type="number" autoFocus value={delta} onChange={(e) => setDelta(e.target.value)} className="input-premium mt-1 w-32 px-3 py-2 text-sm" placeholder="-5" />
              </div>
              <button onClick={applyAdjust} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white">{fr ? "Appliquer" : "Apply"}</button>
              <button onClick={() => { setShowAdjust(false); setDelta(""); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">{fr ? "Annuler" : "Cancel"}</button>
            </div>
          ) : (
            <button onClick={() => setShowAdjust(true)} className="mt-4 rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">{fr ? "Ajuster le stock" : "Adjust Stock"}</button>
          )}
        </DetailGridSection>

        <DetailGridSection title="Related Navigation">
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/seller/products/${item.productId}`} className="text-sky-600 hover:underline">→ Product Detail</Link>
            <Link href="/seller/orders" className="text-sky-600 hover:underline">→ Orders</Link>
            <Link href="/seller/returns" className="text-sky-600 hover:underline">→ Returns</Link>
            <Link href="/seller/replacements" className="text-sky-600 hover:underline">→ Replacements</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Historique des mouvements" : "Stock Movement History"} span={3}>
          <DataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "type", label: "Type" },
              { key: "quantity", label: fr ? "Quantité" : "Quantity" },
              { key: "reference", label: fr ? "Référence" : "Reference" },
              { key: "user", label: fr ? "Utilisateur" : "User" },
            ]}
            data={movements}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
