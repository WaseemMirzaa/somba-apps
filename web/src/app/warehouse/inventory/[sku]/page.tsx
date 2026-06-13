"use client";

import { useState } from "react";
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

type StockAction = "adjust" | "move" | "reserve";

export default function WarehouseInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const item = getInventory(decodeURIComponent(sku));

  const [qty, setQty] = useState({
    available: item?.available ?? 0,
    reserved: item?.reserved ?? 0,
    allocated: item?.allocated ?? 0,
    damaged: item?.damaged ?? 0,
  });
  const [movements, setMovements] = useState(
    (item?.movements ?? []).map((m) => ({ time: m.time, label: m.label, qty: m.qty }))
  );
  const [action, setAction] = useState<StockAction | null>(null);
  const [amount, setAmount] = useState("");

  if (!item) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Article introuvable" : "Inventory item not found"}</div>;
  }

  function applyAction() {
    const n = Math.abs(Number(amount) || 0);
    if (!action || n === 0) {
      toast(fr ? "Saisissez une quantité" : "Enter a quantity", "error");
      return;
    }
    if (action === "adjust") {
      setQty((q) => ({ ...q, available: q.available + Number(amount) }));
      setMovements((m) => [{ time: fr ? "À l'instant" : "Just now", label: fr ? "Ajustement de stock" : "Stock adjusted", qty: Number(amount) }, ...m]);
      toast(fr ? `Stock ajusté de ${Number(amount)}` : `Stock adjusted by ${Number(amount)}`);
    } else if (action === "move") {
      if (n > qty.available) { toast(fr ? "Quantité supérieure au disponible" : "Amount exceeds available", "error"); return; }
      setQty((q) => ({ ...q, available: q.available - n }));
      setMovements((m) => [{ time: fr ? "À l'instant" : "Just now", label: fr ? "Stock déplacé" : "Stock moved", qty: -n }, ...m]);
      toast(fr ? `${n} unités déplacées` : `${n} units moved`, "info");
    } else if (action === "reserve") {
      if (n > qty.available) { toast(fr ? "Quantité supérieure au disponible" : "Amount exceeds available", "error"); return; }
      setQty((q) => ({ ...q, available: q.available - n, reserved: q.reserved + n }));
      setMovements((m) => [{ time: fr ? "À l'instant" : "Just now", label: fr ? "Stock réservé" : "Stock reserved", qty: -n }, ...m]);
      toast(fr ? `${n} unités réservées` : `${n} units reserved`, "info");
    }
    setAction(null);
    setAmount("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.product}
        subtitle={`SKU: ${item.sku} · ${fr ? "Emplacement" : "Location"}: ${item.location}`}
        backHref="/warehouse/inventory"
        breadcrumbs={[
          { label: "Warehouse", href: "/warehouse" },
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
              { label: fr ? "Produit" : "Product", value: <Link href={`/shop/products/${item.productId}`} className="text-indigo-600 hover:underline">{item.product}</Link> },
              { label: fr ? "Catégorie" : "Category", value: item.category },
              { label: fr ? "Emplacement" : "Warehouse Location", value: item.location },
            ]} />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Navigation associée" : "Related Navigation"}>
            <div className="flex flex-wrap gap-3">
              <Link href={`/shop/products/${item.productId}`} className="text-sm text-indigo-600 hover:underline">→ {fr ? "Détail produit" : "Product Detail"}</Link>
              <Link href="/warehouse/replacements" className="text-sm text-indigo-600 hover:underline">→ {fr ? "Remplacements" : "Replacement Cases"}</Link>
              <Link href="/warehouse/dispatch" className="text-sm text-indigo-600 hover:underline">→ {fr ? "Expéditions" : "Dispatches"}</Link>
            </div>
          </DetailGridSection>

          <DetailGridSection title={fr ? "Quantités" : "Quantities"} span={3}>
            <InfoGrid columns={4} items={[
              { label: fr ? "Disponible" : "Available", value: qty.available },
              { label: fr ? "Réservé" : "Reserved", value: qty.reserved },
              { label: fr ? "Alloué" : "Allocated", value: qty.allocated },
              { label: fr ? "Endommagé" : "Damaged", value: qty.damaged },
            ]} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => { setAction("adjust"); setAmount(""); }} className={`rounded-lg border px-4 py-2 text-sm hover:bg-indigo-50 ${action === "adjust" ? "border-indigo-500 bg-indigo-50" : "border-indigo-200"}`}>{fr ? "Ajuster le stock" : "Adjust Stock"}</button>
              <button onClick={() => { setAction("move"); setAmount(""); }} className={`rounded-lg border px-4 py-2 text-sm hover:bg-indigo-50 ${action === "move" ? "border-indigo-500 bg-indigo-50" : "border-indigo-200"}`}>{fr ? "Déplacer le stock" : "Move Stock"}</button>
              <button onClick={() => { setAction("reserve"); setAmount(""); }} className={`rounded-lg border px-4 py-2 text-sm hover:bg-indigo-50 ${action === "reserve" ? "border-indigo-500 bg-indigo-50" : "border-indigo-200"}`}>{fr ? "Réserver le stock" : "Reserve Stock"}</button>
            </div>
            {action && (
              <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                <div>
                  <label className="text-xs text-slate-500">{action === "adjust" ? (fr ? "Delta (+/-)" : "Delta (+/-)") : (fr ? "Quantité" : "Quantity")}</label>
                  <input
                    type="number"
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="input-premium mt-1 w-32 px-3 py-2 text-sm"
                    placeholder={action === "adjust" ? "-5" : "10"}
                  />
                </div>
                <button onClick={applyAction} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">{fr ? "Appliquer" : "Apply"}</button>
                <button onClick={() => { setAction(null); setAmount(""); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">{fr ? "Annuler" : "Cancel"}</button>
              </div>
            )}
          </DetailGridSection>

          <DetailGridSection title={fr ? "Historique des mouvements" : "Movement History"} span={3}>
            <ActivityTimeline events={movements.map((m) => ({
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
