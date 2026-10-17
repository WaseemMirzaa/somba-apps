"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { SellerStatusActions } from "@/components/admin/status-actions";
import { PeriodTabs, type PeriodDays } from "@/components/admin/period-tabs";
import { DailyBarChart } from "@/components/admin/series-charts";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { useRealtime } from "@/context/realtime-context";
import { orderStatusLabel, useServerList } from "@/lib/admin-live";
import { useSocketQuery, type SellerAnalytics } from "@/lib/admin-stats";
import type { Seller } from "@/lib/realtime/types";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { Ban } from "lucide-react";

const PRODUCT_STATUS_FR: Record<string, string> = { live: "En ligne", approved: "Approuvé", pending: "En attente", rejected: "Rejeté", removed: "Bloqué", draft: "Brouillon" };

type SellerFull = Seller & { pickupAddress?: string | null; plan?: string; planExpiresAt?: string | null };

const hours = (h: number | null, fr: boolean) => (h === null ? "—" : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} ${fr ? "j" : "d"}`);

export default function AdminSellerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const [days, setDays] = useState<PeriodDays>(30);
  const sellers = useServerList<SellerFull>("sellers:list", { pushEvents: ["seller:updated"] });
  const seller = sellers.items.find((s) => s.id === id) ?? null;
  const stats = useSocketQuery<SellerAnalytics>("analytics:seller", { sellerId: id, days }, { enabled: !!seller });

  const sellerProducts = useMemo(() => rt.products.filter((p) => p.sellerId === id), [rt.products, id]);
  const productIds = useMemo(() => new Set(sellerProducts.map((p) => p.id)), [sellerProducts]);
  const sellerOrders = useMemo(
    () =>
      rt.orders
        .filter((o) => o.items?.some((it) => productIds.has(it.productId)))
        .map((o) => ({
          id: o.reference,
          customer: o.customerName,
          amount: o.items.filter((it) => productIds.has(it.productId)).reduce((s, it) => s + it.priceUsd * it.qty, 0),
          status: o.status,
          date: o.createdAt.slice(0, 10),
        })),
    [rt.orders, productIds],
  );
  // Payouts are keyed by the seller's user id.
  const payouts = rt.payouts.filter((p) => seller && (p.sellerId === seller.userId || p.sellerId === seller.id));
  const sum = (status: string) => payouts.filter((p) => p.status === status).reduce((s, p) => s + p.amountUsd, 0);

  if (sellers.loading && !sellers.error) return <SectionLoading className="min-h-[40vh]" />;
  if (sellers.error) return <SectionError message={sellers.error} onRetry={sellers.reload} />;
  if (!seller) return <div className="p-8 text-center text-slate-500">{fr ? "Vendeur introuvable" : "Seller not found"}</div>;

  const suspended = seller.status === "suspended";
  const st = stats.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={seller.name}
        subtitle={`${fr ? "Inscrit le" : "Registered"} ${seller.createdAt.slice(0, 10)}`}
        backHref="/admin/sellers"
        breadcrumbs={[adminBreadcrumb(locale), { label: t("sellers"), href: "/admin/sellers" }, { label: seller.name }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={seller.status === "approved" ? "success" : seller.status === "pending" ? "warning" : "danger"}>{seller.status}</Badge>
            <SellerStatusActions sellerId={seller.id} status={seller.status} name={seller.name} size="md" />
          </div>
        }
      />

      {suspended && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Ban className="h-5 w-5 shrink-0" />
          <p>{fr ? "Ce vendeur est suspendu. Utilisez « Rétablir » pour lui redonner accès." : "This seller is suspended. Use “Reinstate” to give access back."}</p>
        </div>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Boutique" : "Store"}>
          <InfoGrid items={[
            { label: fr ? "Nom de la boutique" : "Store name", value: seller.name },
            { label: fr ? "Adresse d'enlèvement" : "Pickup address", value: seller.pickupAddress || "—", full: true },
            { label: fr ? "Badge" : "Badge", value: seller.badge.replace(/_/g, " ") },
            { label: fr ? "Note moyenne" : "Rating", value: seller.rating > 0 ? `★ ${Number(seller.rating).toFixed(1)}` : "—" },
            { label: fr ? "Formule" : "Plan", value: `${seller.plan ?? "free"}${seller.planExpiresAt ? ` · ${fr ? "jusqu'au" : "until"} ${String(seller.planExpiresAt).slice(0, 10)}` : ""}` },
            { label: fr ? "Produits" : "Products", value: sellerProducts.length },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Versements" : "Payouts"}>
          <InfoGrid items={[
            { label: fr ? "Demandé" : "Requested", value: formatCurrency(sum("requested"), locale) },
            { label: fr ? "Approuvé" : "Approved", value: formatCurrency(sum("approved"), locale) },
            { label: fr ? "Total versé" : "Total paid", value: formatCurrency(sum("paid"), locale) },
          ]} />
          <Link href="/admin/payouts" className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline">{fr ? "Voir les versements →" : "View payouts →"}</Link>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Performance (serveur)" : "Performance (server)"} span={2}>
          <div className="mb-3 flex justify-end"><PeriodTabs value={days} onChange={setDays} /></div>
          {stats.error ? (
            <SectionError message={stats.error} onRetry={stats.reload} />
          ) : !st ? (
            <SectionLoading />
          ) : (
            <div className="space-y-5">
              <InfoGrid columns={3} items={[
                { label: fr ? "Chiffre d'affaires" : "Revenue", value: formatCurrency(st.revenue, locale) },
                { label: fr ? "Commandes" : "Orders", value: st.orders },
                { label: fr ? "Unités" : "Units", value: st.units },
                { label: fr ? "Panier moyen" : "Avg. order", value: formatCurrency(st.aov, locale) },
                { label: fr ? "Score de santé" : "Health score", value: st.health.score === null ? "—" : `${st.health.score}/100 (${st.health.grade})` },
                { label: fr ? "Note (avis visibles)" : "Rating (visible reviews)", value: st.reviews.average === null ? "—" : `★ ${st.reviews.average} · ${st.reviews.count} ${fr ? "avis" : "reviews"}, ${st.reviews.replied} ${fr ? "avec réponse" : "replied"}` },
                { label: fr ? "Délai de préparation" : "Time to ready", value: hours(st.fulfilment.avgHoursToReady, fr) },
                { label: fr ? "Délai de livraison" : "Time to delivered", value: hours(st.fulfilment.avgHoursToDelivered, fr) },
                { label: fr ? "Annulations / retours / litiges" : "Cancel / return / dispute", value: `${st.fulfilment.cancelRatePct}% / ${st.fulfilment.returnRatePct}% / ${st.fulfilment.disputeRatePct}%` },
                { label: fr ? "Clients (fidèles)" : "Customers (repeat)", value: `${st.customers.total} (${st.customers.repeatRatePct}%)` },
                { label: fr ? "Vues produit" : "Product views", value: st.funnel.views },
                { label: fr ? "Conversion" : "Conversion", value: st.funnel.conversionPct === null ? "—" : `${st.funnel.conversionPct}%` },
              ]} />
              <DailyBarChart
                data={st.revenueSeries.map((d) => ({ date: d.date, value: d.revenue, secondary: d.orders }))}
                valueLabel={fr ? "Chiffre d'affaires (USD)" : "Revenue (USD)"}
                secondaryLabel={fr ? "Commandes" : "Orders"}
                height={160}
              />
              {st.topProducts.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{fr ? "Produits les plus vendus" : "Top products"}</h3>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm">
                    {st.topProducts.map((p) => (
                      <li key={p.productId} className="flex items-center justify-between gap-3 px-3 py-2">
                        <Link href={`/admin/products/${p.productId}`} className="min-w-0 truncate text-[var(--primary)] hover:underline">{p.name}</Link>
                        <span className="shrink-0 text-xs text-slate-500">{p.units} {fr ? "unités" : "units"} · {formatCurrency(p.revenue, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Tickets de support" : "Support Tickets"}>
          <Link href="/admin/support" className="text-sm font-medium text-[var(--primary)] hover:underline">{fr ? "Voir le support →" : "Open Support →"}</Link>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits du vendeur" : "Seller Products"} span={3}>
          <DataTable
            emptyMessage={fr ? "Aucun produit pour ce vendeur" : "No products for this seller"}
            columns={[
              { key: "name", label: fr ? "Produit" : "Product", render: (row) => (
                <Link href={`/admin/products/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.name)}</Link>
              )},
              { key: "stock", label: "Stock" },
              { key: "price", label: fr ? "Prix" : "Price", render: (row) => formatCurrency(row.price as number, locale) },
              { key: "status", label: t("status"), render: (row) => <Badge>{fr ? (PRODUCT_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
            ]}
            data={sellerProducts as unknown as Record<string, unknown>[]}
            rowAction={(row) => <Link href={`/admin/products/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commandes du vendeur" : "Seller Orders"} span={3}>
          {sellerOrders.length === 0 ? (
            <EmptyState>{fr ? "Aucune commande pour ce vendeur." : "No orders for this seller yet."}</EmptyState>
          ) : (
            <DataTable
              columns={[
                { key: "id", label: fr ? "N° de commande" : "Order ID", render: (row) => (
                  <Link href={`/admin/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.id)}</Link>
                )},
                { key: "customer", label: t("customer") },
                { key: "amount", label: fr ? "Montant (articles)" : "Amount (items)", render: (row) => formatCurrency(row.amount as number, locale) },
                { key: "status", label: t("status"), render: (row) => <Badge variant="info">{orderStatusLabel(String(row.status), fr)}</Badge> },
                { key: "date", label: t("date") },
              ]}
              data={sellerOrders as unknown as Record<string, unknown>[]}
              rowAction={(row) => <Link href={`/admin/orders/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>}
            />
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
