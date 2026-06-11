"use client";

import { WarehouseDashboardView } from "@/components/warehouse/warehouse-dashboard-view";
import { useLocale } from "@/context/locale-context";

export default function WarehouseDashboard() {
  useLocale();
  return <WarehouseDashboardView />;
}
