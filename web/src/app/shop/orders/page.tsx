"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useMyOrders, orderStatusLabel } from "@/lib/orders";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { LoadMore } from "@/components/ui/load-more";
import { useRealtime } from "@/context/realtime-context";
import { cancelledCount } from "@/lib/shop-packages";

function OrdersList() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const orders = useMyOrders();
  const rt = useRealtime();

  const statusLabel = (status: string) => orderStatusLabel(status, fr);

  const cancelledLines = (orderId: string) => cancelledCount(rt.orders.find((o) => o.id === orderId)?.items ?? []);

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Mes commandes" : "My Orders"} subtitle={fr ? "Vos commandes, mises à jour en direct" : "Your orders, updated live"} />

      {rt.listError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="min-w-0 flex-1">{rt.listError}</span>
          <button type="button" onClick={() => void rt.reloadLists()} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-red-100">{fr ? "Réessayer" : "Retry"}</button>
        </div>
      )}

      <DataTable
        emptyMessage={rt.status !== "connected" ? (fr ? "Chargement…" : "Loading…") : fr ? "Vous n'avez pas encore de commande." : "You have no orders yet."}
        columns={[
          { key: "id", label: fr ? "Commande" : "Order", render: (row) => (
            <Link href={`/shop/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
          )},
          { key: "date", label: fr ? "Date" : "Date" },
          { key: "itemsCount", label: fr ? "Articles" : "Items" },
          { key: "amount", label: fr ? "Montant" : "Amount", render: (row) => formatCurrency(row.amount as number, locale) },
          { key: "paymentMethod", label: fr ? "Paiement" : "Payment", render: (row) => formatPaymentMethod(String(row.paymentMethodId ?? row.paymentMethod), locale) },
          { key: "status", label: fr ? "Statut" : "Status", render: (row) => {
            const n = row.status === "cancelled" ? 0 : cancelledLines(String(row.id));
            return (
              <div className="space-y-1">
                <Badge variant={row.status === "cancelled" ? "danger" : row.status === "delivered" ? "success" : "info"}>{statusLabel(String(row.status))}</Badge>
                {n > 0 && (
                  <p className="text-xs text-red-700">
                    {fr
                      ? `${n} ${n === 1 ? "article annulé" : "articles annulés"} par le vendeur`
                      : `${n} ${n === 1 ? "item" : "items"} cancelled by the seller`}
                  </p>
                )}
              </div>
            );
          } },
          { key: "actions", label: fr ? "Actions" : "Actions", render: (row) => (
            <div className="flex gap-2 text-xs">
              <Link href={`/shop/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{fr ? "Voir" : "View"}</Link>
              {row.status === "delivered" && (
                <Link href={`/shop/orders/${row.id}/return`} className="text-slate-500 hover:text-[var(--primary)]">{fr ? "Retour" : "Return"}</Link>
              )}
            </div>
          )},
        ]}
        data={orders as unknown as Record<string, unknown>[]}
      />

      <LoadMore hasMore={rt.hasMoreOrders} onLoad={rt.loadMoreOrders} loaded={orders.length} noun={{ en: "orders", fr: "commandes" }} />
    </div>
  );
}

export default function ShopOrdersPage() {
  return (
    <RequireSignIn next="/shop/orders">
      <OrdersList />
    </RequireSignIn>
  );
}
