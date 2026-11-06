"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { OpsError } from "@/components/warehouse/ops-state";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { HistoryList } from "@/components/warehouse/stock/history";
import { BinChips } from "@/components/warehouse/stock/shared";
import { useWarehouseData } from "@/lib/warehouse";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { useLocale } from "@/context/locale-context";
import { stockApi, useStockAccess, useStockQuery, type OnHand, type ProductMatch } from "@/lib/stock";
import { STOCK_STATUS, pick } from "@/lib/warehouse-live";
import { pickText } from "@/lib/i18n-fields";
import { useRealtime } from "@/context/realtime-context";

/** One SKU: the seller's catalogue stock and custody, what this warehouse holds by bin, and the history of every movement. */
export default function WarehouseInventoryDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const rt = useRealtime();
  const access = useStockAccess();
  const { inventory } = useWarehouseData();
  const decoded = decodeURIComponent(sku);
  const item = inventory.find((i) => i.sku === decoded);
  const [product, setProduct] = useState<ProductMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looked, setLooked] = useState(false);
  const connected = rt.status === "connected";

  // The SKU label is the first six characters of the product id: resolve it to the product (and its options).
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    void (async () => {
      try {
        const r = await stockApi.lookup({ code: decoded, ...(access.hubId ? { hubId: access.hubId } : {}) });
        if (!alive) return;
        setProduct(r.products.find((p) => p.sku.toLowerCase() === decoded.toLowerCase()) ?? null);
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Request failed.");
      } finally {
        if (alive) setLooked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [connected, decoded, access.hubId]);

  const productId = product?.productId ?? item?.productId;
  const stock = useStockQuery<OnHand>("stock:onHand", { productId: productId ?? "", limit: 100 }, { total: 0, units: 0, rows: [] }, !!productId);
  const listHref = ops("/inventory");

  if (!product && !item) {
    return (
      <div className="p-8 text-center text-slate-500">
        {error ? <OpsError message={error} /> : !looked ? (fr ? "Chargement…" : "Loading…") : fr ? "Article d'inventaire introuvable" : "Inventory item not found"}
      </div>
    );
  }

  const name = product ? pickText(fr, product.name, product.nameFr) : pickText(fr, item!.name, item!.nameFr);
  const heldHere = stock.data.rows.reduce((s, r) => s + r.onHand, 0);
  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        subtitle={`SKU: ${decoded}`}
        backHref={listHref}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Inventaire" : "Inventory", href: listHref },
          { label: decoded },
        ]}
        actions={item ? <Badge variant={item.status === "ok" ? "success" : item.status === "low" ? "warning" : "danger"}>{pick(STOCK_STATUS[item.status], fr, item.status)}</Badge> : undefined}
      />
      <HubScopeBar />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"} span={2}>
          <InfoGrid
            items={[
              { label: "SKU", value: decoded },
              { label: fr ? "Produit" : "Product", value: name },
              ...(item ? [{ label: fr ? "Catégorie" : "Category", value: pickText(fr, item.category, item.categoryFr) }, { label: fr ? "Stock du vendeur" : "Seller stock", value: item.stock }] : []),
              { label: fr ? "En stock dans l'entrepôt" : "Held in the warehouse", value: heldHere },
            ]}
          />
        </DetailGridSection>
        <DetailGridSection title={fr ? "Par emplacement" : "By bin"}>
          {stock.data.rows.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Rien en stock ici pour le moment." : "Nothing in stock here at the moment."}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stock.data.rows.map((r) => (
                <li key={`${r.hubId}|${r.variant}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-700">{r.variant === "Default" ? (fr ? "Tout" : "All") : r.variant} · <span className="font-semibold tabular-nums">{r.onHand}</span></span>
                  <BinChips bins={r.bins} />
                </li>
              ))}
            </ul>
          )}
        </DetailGridSection>
      </DetailGrid>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">{fr ? "Historique" : "History"}</h2>
        {productId ? <HistoryList productId={productId} showFilters={false} /> : null}
      </section>
    </div>
  );
}
