import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PortalGuard } from "@/components/layout/portal-guard";
import { PasswordChangeGate } from "@/components/layout/password-change-gate";
import { StaffTwoFaGate } from "@/components/admin/staff-twofa-gate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard>
      <PasswordChangeGate>
        <DashboardLayout portal="admin">
          <StaffTwoFaGate>{children}</StaffTwoFaGate>
        </DashboardLayout>
      </PasswordChangeGate>
    </PortalGuard>
  );
}
