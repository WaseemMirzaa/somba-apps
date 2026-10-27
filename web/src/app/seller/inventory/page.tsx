"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, PackageX, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { ProductImage } from "@/components/seller/product-image";
import { StatTile } from "@/components/seller/stat-tile";
import { StockAdjust } from "@/components/seller/stock-adjust";
import { StockThresholdCard } from "@/components/seller/stock-threshold";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { useLiveQuery, useSocketEvent, sellerRequest } from "@/lib/seller-api";
import { downloadCsv, errMessage, productStatusLabel, productStatusVariant } from "@/lib/seller-labels";
import { variantLabels, type StockLowPush, type StockOverview } from "@/lib/seller-stock";

const PAGE_SIZE = 25;

export default function SellerInventoryPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { sellerProductList } = useSellerData();
  const access = useSellerAccess();
  const canEdit = access.can("catalog") && !access.suspended;

  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [highlight, setHighlight] = useState<Record<string, number>>({});

  // Search is sent to the server after a short pause, never on every key.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(q.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  const body = useMemo(
    () => ({ ...(search ? { q: search } : {}), ...(lowOnly ? { low: true } : {}), limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [search, lowOnly, page],
  );
  const overview = useLiveQuery<StockOverview>("inventory:overview", body, { pushes: ["product:updated", "product:created", "stock:low", "order:updated", "order:created"] });
  const data = overview.data;

  // A product crossing its low-stock line: say so and mark its row for a few seconds.
  useSocketEvent<StockLowPush>("stock:low", (p) => {
    const name = sellerProductList.find((x) => x.id === p.productId)?.name ?? (fr ? "Un produit" : "A product");
    const where = p.variant ? ` (${p.variant})` : "";
    toast(
      p.outOfStock
        ? fr ? `Rupture de stock : ${name}${where}` : `Out of stock: ${name}${where}`
        : fr ? `Stock bas : ${name}${where} — ${p.stock} restant(s), seuil ${p.threshold}` : `Low stock: ${name}${where} — ${p.stock} left, line ${p.threshold}`,
      "error",
    );
    setHighlight((cur) => ({ ...cur, [p.productId]: Date.now() }));
    setTimeout(() => setHighlight((cur) => {
      const { [p.productId]: _gone, ...rest } = cur;
      void _gone;
      return rest;
    }), 8000);
  });

  const nameOf = (id: string, fallback: string) => sellerProductList.find((p) => p.id === id)?.name || fallback;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  async function exportCsv() {
    try {
      const all = await sellerRequest<StockOverview>("inventory:overview", { ...(search ? { q: search } : {}), ...(lowOnly ? { low: true } : {}), limit: 200, offset: 0 });
      downloadCsv("inventory.csv", [
        ["SKU", fr ? "Produit" : "Product", fr ? "En stock" : "In stock", fr ? "Réserve commune" : "Shared pool", fr ? "En commandes ouvertes" : "In open orders", fr ? "Stock bas" : "Low stock"],
        ...all.items.map((r) => [r.sku ?? "", r.name, r.stock, r.pool, r.reserved, r.outOfStock ? (fr ? "Rupture" : "Out") : r.low ? (fr ? "Oui" : "Yes") : ""]),
      ]);
      toast(fr ? "CSV exporté" : "CSV exported");
    } catch (e) {
      toast(errMessage(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("inventory")}
        subtitle={
          fr
            ? "Stock réel de vos annonces : ajoutez ou retirez des unités, chaque mouvement est consigné"
            : "Live stock of your listings: add or remove units, every movement is logged"
        }
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("inventory") }]}
        actions={
          <button onClick={() => void exportCsv()} className="rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">
            {fr ? "Exporter CSV" : "Export CSV"}
          </button>
        }
      />

      {overview.error && <LoadError message={overview.error} onRetry={overview.reload} />}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile title={fr ? "Produits" : "Products"} value={String(data.summary.products)} icon={Boxes} />
          <StatTile title={fr ? "Unités en stock" : "Units in stock"} value={String(data.summary.units)} icon={Layers} />
          <StatTile title={fr ? "Stock bas" : "Low stock"} value={String(data.summary.lowStock)} hint={fr ? `à ${data.lowStockThreshold} ou moins` : `at ${data.lowStockThreshold} or fewer`} icon={AlertTriangle} />
          <StatTile title={fr ? "En rupture" : "Out of stock"} value={String(data.summary.outOfStock)} icon={PackageX} />
        </div>
      )}

      <StockThresholdCard current={data?.lowStockThreshold ?? null} canEdit={canEdit} onSaved={() => void overview.reload()} />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[14rem] flex-1 text-xs text-slate-500">
              {fr ? "Rechercher" : "Search"}
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={fr ? "SKU, nom du produit…" : "SKU, product name…"}
                className="input-premium mt-1 w-full px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={lowOnly} onChange={(e) => { setLowOnly(e.target.checked); setPage(0); }} />
              {fr ? "Stock bas seulement" : "Low stock only"}
            </label>
          </div>

          {overview.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={lowOnly ? (fr ? "Aucun produit en stock bas." : "No product is low on stock.") : fr ? "Aucun produit trouvé." : "No product found."}
              columns={[
                {
                  key: "sku",
                  label: "SKU",
                  render: (row) => (
                    <Link href={`/seller/inventory/${encodeURIComponent(String(row.productId))}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.sku ?? (fr ? "(sans SKU)" : "(no SKU)"))}
                    </Link>
                  ),
                },
                {
                  key: "name",
                  label: fr ? "Produit" : "Product",
                  render: (row) => (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
                        <ProductImage src={String(row.image || "/brand/logo-stack.png")} />
                      </div>
                      <div className="min-w-0">
                        <Link href={`/seller/products/${row.productId}`} className="block truncate text-[var(--primary)] hover:underline">
                          {nameOf(String(row.productId), String(row.name))}
                        </Link>
                        {String(row.status) !== "live" && <Badge variant={productStatusVariant(String(row.status))}>{productStatusLabel(String(row.status), fr)}</Badge>}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "stock",
                  label: fr ? "En stock" : "In stock",
                  render: (row) => {
                    const it = row as unknown as StockOverview["items"][number];
                    const labels = variantLabels(it);
                    return (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-2">
                          <strong className={it.outOfStock ? "text-red-700" : it.low ? "text-amber-700" : "text-slate-900"}>{it.stock}</strong>
                          {it.outOfStock ? <Badge variant="danger">{fr ? "Rupture" : "Out of stock"}</Badge> : it.low ? <Badge variant="warning">{fr ? "Stock bas" : "Low"}</Badge> : null}
                          {row._hot ? <Badge variant="danger" className="animate-pulse">{fr ? "Vient de passer sous le seuil" : "Just crossed the line"}</Badge> : null}
                        </span>
                        {labels.length > 0 && (
                          <ul className="space-y-0.5 text-xs text-slate-500">
                            {labels.map((l) => (
                              <li key={l}>{l}: <span className="font-medium text-slate-700">{it.variantStock?.[l]}</span></li>
                            ))}
                            <li>{fr ? "Réserve commune" : "Shared pool"}: <span className="font-medium text-slate-700">{it.pool}</span></li>
                          </ul>
                        )}
                      </div>
                    );
                  },
                },
                { key: "reserved", label: fr ? "En commandes ouvertes" : "In open orders" },
                {
                  key: "actions",
                  label: t("action"),
                  render: (row) => {
                    const it = row as unknown as StockOverview["items"][number];
                    return (
                      <div className="flex flex-wrap items-start gap-3 text-xs">
                        <Link href={`/seller/inventory/${encodeURIComponent(it.productId)}`} className="text-[var(--primary)] hover:underline">
                          {fr ? "Mouvements" : "Movements"}
                        </Link>
                        {canEdit && <StockAdjust item={{ ...it, name: nameOf(it.productId, it.name) }} />}
                      </div>
                    );
                  },
                },
              ]}
              data={(data?.items ?? []).map((it) => ({ ...it, _hot: !!highlight[it.productId] })) as unknown as Record<string, unknown>[]}
            />
          )}

          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>{fr ? `Page ${page + 1} sur ${pages} · ${data.total} produits` : `Page ${page + 1} of ${pages} · ${data.total} products`}</span>
              <span className="flex gap-2">
                <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">{fr ? "Précédent" : "Previous"}</button>
                <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">{fr ? "Suivant" : "Next"}</button>
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
