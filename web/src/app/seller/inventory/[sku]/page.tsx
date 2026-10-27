"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { StockAdjust } from "@/components/seller/stock-adjust";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { useLiveQuery } from "@/lib/seller-api";
import { localDateTime } from "@/lib/dates";
import { movementReasonLabel, movementReasonVariant, variantLabels, type StockMovements, type StockOverview } from "@/lib/seller-stock";
import { useLocale } from "@/context/locale-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 20;

/** `/seller/inventory/<product id | SKU>`: the stock of one product, its options and the full movement log. */
export default function SellerInventoryDetailPage() {
  const { sku: param } = useParams<{ sku: string }>();
  const key = decodeURIComponent(param);
  const { locale } = useLocale();
  const fr = locale === "fr";
  const access = useSellerAccess();
  const canEdit = access.can("catalog") && !access.suspended;
  const { sellerProductList, getRawProduct, load } = useSellerData();

  // The URL carries the product id (or a SKU, or an old derived SKU-XXXXXX from a saved link).
  const known = useMemo(() => {
    const byId = UUID.test(key) ? sellerProductList.find((p) => p.id === key) : undefined;
    const bySku = sellerProductList.find((p) => p.sku.toLowerCase() === key.toLowerCase());
    return byId ?? bySku ?? null;
  }, [key, sellerProductList]);
  const productId = known?.id ?? (UUID.test(key) ? key : null);
  const raw = productId ? getRawProduct(productId) : undefined;
  const searchText = (raw as { sku?: string | null } | undefined)?.sku || raw?.name || known?.nameEn || (UUID.test(key) ? "" : key);

  const overview = useLiveQuery<StockOverview>("inventory:overview", { ...(searchText ? { q: searchText } : {}), limit: 200 }, {
    pushes: ["product:updated", "stock:low", "order:updated"],
  });
  const item = overview.data?.items.find((i) => i.productId === productId) ?? (overview.data?.items.find((i) => i.sku?.toLowerCase() === key.toLowerCase()) ?? null);
  const id = item?.productId ?? productId;

  const [page, setPage] = useState(0);
  const movements = useLiveQuery<StockMovements>("inventory:movements", id ? { productId: id, limit: PAGE, offset: page * PAGE } : null, {
    pushes: ["product:updated"],
    pick: (p) => (p as { id?: string }).id === id,
  });

  const name = (id && sellerProductList.find((p) => p.id === id)?.name) || item?.name || known?.name || key;

  if (!item) {
    if (overview.error) return <LoadError message={overview.error} onRetry={overview.reload} />;
    if (overview.loading || load.loading) return <SectionLoader />;
    return <EmptyState>{fr ? "Stock introuvable" : "Inventory not found"}</EmptyState>;
  }

  const labels = variantLabels(item);
  const mv = movements.data;
  const pages = mv ? Math.max(1, Math.ceil(mv.total / PAGE)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        subtitle={`SKU: ${item.sku ?? (fr ? "(sans SKU)" : "(no SKU)")}`}
        backHref="/seller/inventory"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: fr ? "Stock" : "Inventory", href: "/seller/inventory" },
          { label: item.sku ?? name },
        ]}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid
            items={[
              { label: "SKU", value: item.sku ?? "—" },
              { label: fr ? "Produit" : "Product", value: <Link href={`/seller/products/${item.productId}`} className="text-[var(--primary)] hover:underline">{name}</Link> },
              { label: fr ? "Seuil de stock bas" : "Low-stock line", value: overview.data?.lowStockThreshold ?? "—" },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Résumé du stock" : "Stock Summary"}>
          <InfoGrid
            columns={3}
            items={[
              { label: fr ? "En stock" : "In stock", value: <span className={item.outOfStock ? "text-red-700" : item.low ? "text-amber-700" : ""}>{item.stock}</span> },
              { label: fr ? "En commandes ouvertes" : "In open orders", value: item.reserved },
              { label: fr ? "État" : "State", value: item.outOfStock ? <Badge variant="danger">{fr ? "Rupture" : "Out of stock"}</Badge> : item.low ? <Badge variant="warning">{fr ? "Stock bas" : "Low"}</Badge> : <Badge variant="success">{fr ? "Correct" : "Healthy"}</Badge> },
            ]}
          />
          {canEdit && (
            <div className="mt-4">
              <StockAdjust item={{ ...item, name }} />
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Navigation associée" : "Related Navigation"}>
          <div className="flex flex-wrap gap-3 text-sm">
            <NavLinkButton href={`/seller/products/${item.productId}`}>{fr ? "→ Détail du produit" : "→ Product Detail"}</NavLinkButton>
            <NavLinkButton href="/seller/orders">{fr ? "→ Commandes" : "→ Orders"}</NavLinkButton>
            <NavLinkButton href="/seller/returns">{fr ? "→ Retours" : "→ Returns"}</NavLinkButton>
          </div>
        </DetailGridSection>

        {labels.length > 0 && (
          <DetailGridSection title={fr ? "Stock par option" : "Stock per option"} span={3}>
            <DataTable
              columns={[
                { key: "option", label: fr ? "Option" : "Option" },
                { key: "units", label: fr ? "Unités" : "Units" },
              ]}
              data={[
                ...labels.map((l) => ({ option: l, units: item.variantStock?.[l] ?? 0 })),
                { option: fr ? "Réserve commune (hors option)" : "Shared pool (not tied to an option)", units: item.pool },
              ]}
            />
            <p className="mt-3 text-xs text-slate-500">
              {fr
                ? "Une option sans ligne ci-dessus puise dans la réserve commune. Le stock total est la somme des lignes."
                : "An option without a row above draws on the shared pool. Total stock is the sum of the rows."}
            </p>
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Historique des mouvements de stock" : "Stock movement log"} span={3}>
          {movements.error && <LoadError message={movements.error} onRetry={movements.reload} />}
          {movements.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Aucun mouvement enregistré." : "No movement recorded yet."}
              columns={[
                { key: "createdAt", label: "Date", render: (r) => localDateTime(String(r.createdAt)) },
                { key: "reason", label: fr ? "Motif" : "Reason", render: (r) => <Badge variant={movementReasonVariant(String(r.reason))}>{movementReasonLabel(String(r.reason), fr)}</Badge> },
                { key: "variant", label: fr ? "Option" : "Option", render: (r) => String(r.variant ?? "—") },
                { key: "delta", label: fr ? "Quantité" : "Quantity", render: (r) => <span className={Number(r.delta) < 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>{Number(r.delta) > 0 ? `+${r.delta}` : String(r.delta)}</span> },
                { key: "stockAfter", label: fr ? "Stock après" : "Stock after" },
                {
                  key: "orderId",
                  label: fr ? "Commande" : "Order",
                  render: (r) => (r.orderId ? <Link href={`/seller/orders/${r.orderId}`} className="text-[var(--primary)] hover:underline">{fr ? "Voir la commande" : "View order"}</Link> : "—"),
                },
                { key: "note", label: "Note", render: (r) => String(r.note ?? "") },
              ]}
              data={(mv?.items ?? []) as unknown as Record<string, unknown>[]}
            />
          )}
          {mv && mv.total > PAGE && (
            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
              <span>{fr ? `Page ${page + 1} sur ${pages} · ${mv.total} mouvements` : `Page ${page + 1} of ${pages} · ${mv.total} movements`}</span>
              <span className="flex gap-2">
                <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">{fr ? "Précédent" : "Previous"}</button>
                <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">{fr ? "Suivant" : "Next"}</button>
              </span>
            </div>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
