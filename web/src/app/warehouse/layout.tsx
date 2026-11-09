import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PasswordChangeGate } from "@/components/layout/password-change-gate";
import { PortalGuard } from "@/components/layout/portal-guard";

export default function WarehouseLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard>
      <PasswordChangeGate>
        <DashboardLayout portal="warehouse">{children}</DashboardLayout>
      </PasswordChangeGate>
    </PortalGuard>
  );
}
