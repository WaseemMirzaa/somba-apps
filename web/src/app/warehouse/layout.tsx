import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PortalGuard } from "@/components/layout/portal-guard";

export default function WarehouseLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard>
      <DashboardLayout portal="warehouse">{children}</DashboardLayout>
    </PortalGuard>
  );
}
