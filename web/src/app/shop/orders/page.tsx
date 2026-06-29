"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { orderEntities } from "@/lib/entities";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function ShopOrdersPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: "En attente",
      processing: "En cours",
      shipped: "Expédié",
      delivered: "Livré",
      cancelled: "Annulé",
    };
    return fr ? (map[status] ?? status) : status;
  };

  // formatPaymentMethod is a passthrough; map the "Card" value to French locally.
  const paymentMethodLabel = (method: string) =>
    fr && method === "Card" ? "Carte" : formatPaymentMethod(method, locale);

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Mes commandes" : "My Orders"} subtitle={fr ? "Vue liste — Numéro de commande, Date, Statut, Montant, Articles" : "List View — Order Number, Date, Status, Amount, Items"} />

      <DataTable
        columns={[
          { key: "id", label: fr ? "Commande" : "Order", render: (row) => (
            <Link href={`/shop/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
          )},
          { key: "date", label: fr ? "Date" : "Date" },
          { key: "itemsCount", label: fr ? "Articles" : "Items" },
          { key: "amount", label: fr ? "Montant" : "Amount", render: (row) => formatCurrency(row.amount as number, locale) },
          { key: "paymentMethod", label: fr ? "Paiement" : "Payment", render: (row) => paymentMethodLabel(String(row.paymentMethod)) },
          { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant="info">{statusLabel(String(row.status))}</Badge> },
          { key: "actions", label: fr ? "Actions" : "Actions", render: (row) => (
            <div className="flex gap-2 text-xs">
              <Link href={`/shop/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{fr ? "Voir" : "View"}</Link>
              {row.status === "delivered" && (
                <Link href={`/shop/orders/${row.id}/return`} className="text-slate-500 hover:text-[var(--primary)]">{fr ? "Retour" : "Return"}</Link>
              )}
            </div>
          )},
        ]}
        data={orderEntities.slice(0, 4) as unknown as Record<string, unknown>[]}
      />
    </div>
  );
}
