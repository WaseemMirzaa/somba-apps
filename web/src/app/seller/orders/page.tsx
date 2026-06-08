"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerOrderList as initialOrders } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function SellerOrdersPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [tab, setTab] = useState("new");
  const [orders, setOrders] = useState(initialOrders);

  const filtered = tab === "all"
    ? orders
    : orders.filter((o) => {
        if (tab === "new") return o.shippingStatus === "pending";
        if (tab === "ready") return o.shippingStatus === "ready";
        if (tab === "picked") return o.shippingStatus === "picked";
        if (tab === "delivered") return o.shippingStatus === "delivered";
        return o.orderStatus === tab;
      });

  function acceptOrder(id: string) {
    setOrders((o) => o.map((item) => item.id === id ? { ...item, shippingStatus: "processing" } : item));
    toast(`Order ${id} accepted`);
  }

  function markReady(id: string) {
    setOrders((o) => o.map((item) => item.id === id ? { ...item, shippingStatus: "ready" } : item));
    toast(`Order ${id} marked ready for pickup`);
  }

  return (
    <SellerListPage
      title={t("orders")}
      subtitle="List View — Order Number, Customer, Items, Amount, Payment, Order Status, Shipping Status, Date"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("orders") }]}
      filters={
        <div className="flex flex-wrap gap-2">
          {["new", "processing", "ready", "picked", "delivered"].map((tabId) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium capitalize",
                tab === tabId ? "bg-sky-600 text-white" : "border border-sky-200 text-slate-600 hover:bg-sky-50"
              )}
            >
              {tabId}
            </button>
          ))}
        </div>
      }
      columns={[
        { key: "id", label: "Order", render: (row) => (
          <Link href={`/seller/orders/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "customer", label: "Customer" },
        { key: "items", label: "Items" },
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "paymentMethod", label: "Payment" },
        { key: "orderStatus", label: "Order Status", render: (row) => <Badge variant="info">{String(row.orderStatus)}</Badge> },
        { key: "shippingStatus", label: "Shipping", render: (row) => <Badge>{String(row.shippingStatus)}</Badge> },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/seller/orders/${row.id}`} className="text-sky-600 hover:underline">{t("view")}</Link>
            {row.shippingStatus === "pending" && (
              <button onClick={() => acceptOrder(String(row.id))} className="text-emerald-600 hover:underline">Accept</button>
            )}
            {row.shippingStatus === "processing" && (
              <button onClick={() => markReady(String(row.id))} className="text-sky-600 hover:underline">Mark Ready</button>
            )}
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
