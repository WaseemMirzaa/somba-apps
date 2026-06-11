"use client";

import { WarehouseDashboardView } from "@/components/warehouse/warehouse-dashboard-view";
import { useLocale } from "@/context/locale-context";
import { L } from "@/lib/locale-helpers";

export default function AdminFulfillmentDashboard() {
  const { locale } = useLocale();
  return (
    <WarehouseDashboardView
      hubName={L(locale, "All Warehouses — Fulfillment", "Tous entrepôts — Fulfillment")}
    />
  );
}
