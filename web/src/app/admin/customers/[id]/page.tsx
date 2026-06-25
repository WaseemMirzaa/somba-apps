"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCustomer, orderEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";

const ORDER_STATUS_FR: Record<string, string> = {
  delivered: "Livrée",
  processing: "En traitement",
  cancelled: "Annulée",
  pending: "En attente",
  shipped: "Expédiée",
};

export default function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const customer = getCustomer(Number(id));
  const [status, setStatus] = useState(customer?.status ?? "active");
  const [showCredit, setShowCredit] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");

  if (!customer) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Client introuvable" : "Customer not found"}</div>;
  }

  const customerOrders = orderEntities.filter((o) => o.customerId === customer.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        subtitle={fr ? `${customer.email} · Membre depuis ${customer.joined}` : `${customer.email} · Member since ${customer.joined}`}
        backHref="/admin/customers"
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: t("customers"), href: "/admin/customers" },
          { label: customer.name },
        ]}
        actions={
          <>
            <button
              onClick={() => {
                const next = status === "active" ? "suspended" : "active";
                setStatus(next);
                toast(
                  fr
                    ? `Client ${next === "suspended" ? "suspendu" : "réactivé"}`
                    : `Customer ${next === "suspended" ? "suspended" : "reactivated"}`,
                  next === "suspended" ? "error" : "success"
                );
              }}
              className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
            >
              {status === "active" ? (fr ? "Suspendre" : "Suspend") : fr ? "Réactiver" : "Reactivate"}
            </button>
            <button onClick={() => setShowCredit(true)} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">{fr ? "Créditer le portefeuille" : "Wallet Credit"}</button>
          </>
        }
      />

      {showCredit && (
        <div className="card-premium flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="text-xs text-slate-500">{fr ? "Montant du crédit" : "Credit amount"}</label>
            <input
              type="number"
              className="input-premium mt-1 w-40 px-3 py-2 text-sm"
              placeholder="50.00"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => { toast(fr ? `Portefeuille crédité de ${formatCurrency(Number(creditAmount) || 0, locale)}` : `Wallet credited ${formatCurrency(Number(creditAmount) || 0, locale)}`); setShowCredit(false); setCreditAmount(""); }}>{fr ? "Appliquer le crédit" : "Apply Credit"}</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowCredit(false)}>{fr ? "Annuler" : "Cancel"}</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Informations client" : "Customer Information"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: customer.name },
            { label: t("email"), value: customer.email },
            { label: t("phone"), value: customer.phone },
            { label: fr ? "Ville" : "City", value: customer.city },
            { label: fr ? "Statut" : "Status", value: <Badge variant={status === "active" ? "success" : "danger"}>{fr ? (status === "active" ? "Actif" : status === "suspended" ? "Suspendu" : status) : status}</Badge> },
            { label: fr ? "Inscrit le" : "Joined", value: customer.joined },
          ]} />
        </DetailSection>

        <DetailSection title={fr ? "Activité" : "Activity"}>
          <InfoGrid items={[
            { label: fr ? "Total commandes" : "Total Orders", value: customer.orders },
            { label: fr ? "Total dépensé" : "Total Spent", value: formatCurrency(customer.totalSpent, locale) },
          ]} />
        </DetailSection>
      </div>

      <DetailSection title={fr ? "Commandes" : "Orders"}>
        <DataTable
          columns={[
            { key: "id", label: fr ? "Commande" : "Order", render: (row) => (
              <Link href={`/admin/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.id)}</Link>
            )},
            { key: "date", label: t("date") },
            { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
            { key: "status", label: t("status"), render: (row) => <Badge>{fr ? (ORDER_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
          ]}
          data={customerOrders as unknown as Record<string, unknown>[]}
          rowAction={(row) => (
            <Link href={`/admin/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
          )}
        />
      </DetailSection>
    </div>
  );
}
