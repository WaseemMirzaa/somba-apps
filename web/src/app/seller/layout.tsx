"use client";

import { usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PortalGuard } from "@/components/layout/portal-guard";
import { SellerSubscriptionGuard } from "@/components/seller/subscription-guard";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSubscribe = pathname === "/seller/subscribe";
  const isRegister = pathname === "/seller/register";

  return (
    <PortalGuard>
      <SellerSubscriptionGuard>
        {isSubscribe || isRegister ? children : <DashboardLayout portal="seller">{children}</DashboardLayout>}
      </SellerSubscriptionGuard>
    </PortalGuard>
  );
}
