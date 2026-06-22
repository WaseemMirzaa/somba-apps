"use client";

import { usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PortalGuard } from "@/components/layout/portal-guard";
import { SellerSubscriptionGuard } from "@/components/seller/subscription-guard";
import { SellerGoalsProvider } from "@/context/seller-goals-context";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSubscribe = pathname === "/seller/subscribe";

  return (
    <PortalGuard>
      <SellerSubscriptionGuard>
        <SellerGoalsProvider>
          {isSubscribe ? children : <DashboardLayout portal="seller">{children}</DashboardLayout>}
        </SellerGoalsProvider>
      </SellerSubscriptionGuard>
    </PortalGuard>
  );
}
