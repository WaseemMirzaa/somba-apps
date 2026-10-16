"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useMyOrders, orderStatusLabel } from "@/lib/orders";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { RequireSignIn } from "@/components/shop/require-sign-in";

function OrdersList() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const orders = useMyOrders();

  const statusLabel = (status: string) => orderStatusLabel(status, fr);

  // formatPaymentMethod only translates "COD"; map the remaining "Card" value locally.
  const paymentMethodLabel = (method: string) =>
    fr && method === "Card" ? "Carte" : formatPaymentMethod(method, locale);

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Mes commandes" : "My Orders"} subtitle={fr ? "Vos commandes, mises à jour en direct" : "Your orders, updated live"} />

      <DataTable
        columns={[
          { key: "id", label: fr ? "Commande" : "Order", render: (row) => (
            <Link href={`/shop/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
          )},
          { key: "date", label: fr ? "Date" : "Date" },
          { key: "itemsCount", label: fr ? "Articles" : "Items" },
          { key: "amount", label: fr ? "Montant" : "Amount", render: (row) => formatCurrency(row.amount as number, locale) },
          { key: "paymentMethod", label: fr ? "Paiement" : "Payment", render: (row) => paymentMethodLabel(String(row.paymentMethod)) },
          { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={row.status === "cancelled" ? "danger" : row.status === "delivered" ? "success" : "info"}>{statusLabel(String(row.status))}</Badge> },
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
