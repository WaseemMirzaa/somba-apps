"use client";

import { WarehouseDashboardView } from "@/components/warehouse/warehouse-dashboard-view";
import { useLocale } from "@/context/locale-context";

export default function AdminFulfillmentDashboard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return <WarehouseDashboardView hubName={fr ? "Tous les entrepôts — Logistique" : "All Warehouses — Fulfillment"} />;
}
