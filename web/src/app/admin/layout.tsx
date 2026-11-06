import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PortalGuard } from "@/components/layout/portal-guard";
import { StaffTwoFaGate } from "@/components/admin/staff-twofa-gate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard>
      <DashboardLayout portal="admin">
        <StaffTwoFaGate>{children}</StaffTwoFaGate>
      </DashboardLayout>
    </PortalGuard>
  );
}
