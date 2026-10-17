"use client";

import Link from "next/link";
import { Boxes, PackageX, AlertTriangle, Truck, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/seller/stat-tile";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { productStatusLabel, productStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

/** Stock analytics from the live catalogue: units, stock-outs, low stock, stock value and units in fulfilment. */
export default function SellerInventoryAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerProductList, load } = useSellerData();
  const items = sellerProductList.filter((p) => p.status !== "rejected");
  const units = items.reduce((s, p) => s + p.availableStock, 0);
  const inFulfilment = items.reduce((s, p) => s + p.reservedStock, 0);
  const out = items.filter((p) => p.availableStock === 0);
  const low = items.filter((p) => p.availableStock > 0 && p.availableStock < p.lowStockThreshold);
  const value = items.reduce((s, p) => s + p.price * p.availableStock, 0);
  const attention = [...out, ...low];

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Analytique inventaire" : "Inventory Analytics"}
        subtitle={fr ? "Stock en direct de vos annonces" : "Live stock of your listings"}
        backHref="/seller/analytics"
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("analytics"), href: "/seller/analytics" }, { label: fr ? "Inventaire" : "Inventory" }]}
      />
      {load.error && <LoadError message={load.error} onRetry={load.retry} />}
      {load.loading && items.length === 0 ? (
        <SectionLoader />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile title={fr ? "Annonces" : "Listings"} value={String(items.length)} icon={Boxes} />
            <StatTile title={fr ? "Unités en stock" : "Units in stock"} value={units.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} icon={Boxes} />
            <StatTile title={fr ? "En cours de livraison" : "In fulfilment"} value={String(inFulfilment)} hint={fr ? "unités sur des commandes ouvertes" : "units on open orders"} icon={Truck} />
            <StatTile title={fr ? "Ruptures" : "Out of stock"} value={String(out.length)} icon={PackageX} />
            <StatTile title={fr ? "Stock bas" : "Low stock"} value={String(low.length)} hint={fr ? "moins de 10 unités" : "fewer than 10 units"} icon={AlertTriangle} />
          </div>
          <StatTile title={fr ? "Valeur du stock (au prix de vente)" : "Stock value (at list price)"} value={formatCurrency(value, locale)} icon={DollarSign} />

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{fr ? "À réapprovisionner" : "Needs restocking"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Ruptures et stock bas, les plus urgents d'abord" : "Stock-outs and low stock, most urgent first"}</p>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                emptyMessage={fr ? "Tout est suffisamment approvisionné." : "Everything is well stocked."}
                columns={[
                  { key: "name", label: fr ? "Produit" : "Product", primary: true, render: (r) => <Link href={`/seller/products/${r.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(r.name)}</Link> },
                  { key: "sku", label: "SKU" },
                  { key: "status", label: fr ? "Statut" : "Status", render: (r) => <Badge variant={productStatusVariant(String(r.status))}>{productStatusLabel(String(r.status), fr)}</Badge> },
                  { key: "availableStock", label: "Stock", render: (r) => <Badge variant={Number(r.availableStock) === 0 ? "danger" : "warning"}>{String(r.availableStock)}</Badge> },
                  { key: "reservedStock", label: fr ? "En livraison" : "In fulfilment" },
                  { key: "actions", label: t("action"), render: (r) => <Link href={`/seller/inventory/${encodeURIComponent(String(r.sku))}`} className="text-sm text-[var(--primary)] hover:underline">{fr ? "Ajuster" : "Adjust"}</Link> },
                ]}
                data={attention as unknown as Record<string, unknown>[]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
