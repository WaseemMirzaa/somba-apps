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
import { statusLabel } from "@/lib/locale-helpers";
import { useToast } from "@/context/toast-context";

export default function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const customer = getCustomer(Number(id));
  const [status, setStatus] = useState(customer?.status ?? "active");
  const [showCredit, setShowCredit] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");

  if (!customer) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  const customerOrders = orderEntities.filter((o) => o.customerId === customer.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        subtitle={`${customer.email} · ${t("joined")} ${customer.joined}`}
        backHref="/admin/customers"
        breadcrumbs={[
          { label: t("adminBreadcrumb"), href: "/admin" },
          { label: t("customers"), href: "/admin/customers" },
          { label: customer.name },
        ]}
        actions={
          <>
            <button
              onClick={() => {
                const next = status === "active" ? "suspended" : "active";
                setStatus(next);
                toast(next === "suspended" ? t("blocked") : t("active"), next === "suspended" ? "error" : "success");
              }}
              className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
            >
              {status === "active" ? t("blocked") : t("active")}
            </button>
            <button onClick={() => setShowCredit(true)} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">{t("availableBalance")}</button>
          </>
        }
      />

      {showCredit && (
        <div className="card-premium flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="text-xs text-slate-500">{t("amount")}</label>
            <input
              type="number"
              className="input-premium mt-1 w-40 px-3 py-2 text-sm"
              placeholder="50.00"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => { toast(`${t("approved")} — ${formatCurrency(Number(creditAmount) || 0, locale)}`); setShowCredit(false); setCreditAmount(""); }}>{t("approve")}</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowCredit(false)}>{t("cancel")}</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={t("customerInformation")}>
          <InfoGrid items={[
            { label: t("name"), value: customer.name },
            { label: t("email"), value: customer.email },
            { label: t("phone"), value: customer.phone },
            { label: t("city"), value: customer.city },
            { label: t("status"), value: <Badge variant={status === "active" ? "success" : "danger"}>{statusLabel(locale, status)}</Badge> },
            { label: t("joined"), value: customer.joined },
          ]} />
        </DetailSection>

        <DetailSection title={t("activitySection")}>
          <InfoGrid items={[
            { label: t("totalOrders"), value: customer.orders },
            { label: t("totalSpent"), value: formatCurrency(customer.totalSpent, locale) },
          ]} />
        </DetailSection>
      </div>

      <DetailSection title={t("orders")}>
        <DataTable
          columns={[
            { key: "id", label: t("order"), render: (row) => (
              <Link href={`/admin/orders/${row.id}`} className="text-blue-600 hover:underline">{String(row.id)}</Link>
            )},
            { key: "date", label: t("date") },
            { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
            { key: "status", label: t("status"), render: (row) => <Badge>{statusLabel(locale, String(row.status))}</Badge> },
          ]}
          data={customerOrders as unknown as Record<string, unknown>[]}
        />
      </DetailSection>
    </div>
  );
}
