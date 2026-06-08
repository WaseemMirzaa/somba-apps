"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { transactionList } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerTransactionsPage() {
  const { locale } = useLocale();

  return (
    <SellerListPage
      title="Transactions"
      subtitle="Order, Customer, Gross, Commission, Net, Status, Date"
      breadcrumbs={[
        { label: "Seller", href: "/seller" },
        { label: "Finance", href: "/seller/finance" },
        { label: "Transactions" },
      ]}
      columns={[
        { key: "order", label: "Order", render: (row) => (
          <Link href={`/seller/orders/${row.order}`} className="text-sky-600 hover:underline">{String(row.order)}</Link>
        )},
        { key: "customer", label: "Customer" },
        { key: "grossAmount", label: "Gross", render: (row) => formatCurrency(row.grossAmount as number, locale) },
        { key: "commission", label: "Commission", render: (row) => formatCurrency(row.commission as number, locale) },
        { key: "netAmount", label: "Net", render: (row) => formatCurrency(row.netAmount as number, locale) },
        { key: "status", label: "Status", render: (row) => <Badge variant="success">{String(row.status)}</Badge> },
        { key: "date", label: "Date" },
      ]}
      data={transactionList as unknown as Record<string, unknown>[]}
    />
  );
}
