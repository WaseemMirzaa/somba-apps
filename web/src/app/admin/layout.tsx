import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PortalGuard } from "@/components/layout/portal-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard>
      <DashboardLayout portal="admin">{children}</DashboardLayout>
    </PortalGuard>
  );
}
