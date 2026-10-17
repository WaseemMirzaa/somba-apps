"use client";

import { usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PortalGuard } from "@/components/layout/portal-guard";
import { SellerStoreGate } from "@/components/seller/store-gate";
import { SellerGoalsProvider } from "@/context/seller-goals-context";
import { SellerDataProvider } from "@/lib/seller";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Registration must be reachable before a store (or even a seller account)
  // exists, so it sits outside the portal guard and the store gate.
  if (pathname === "/seller/register") return <>{children}</>;

  return (
    <PortalGuard>
      <SellerDataProvider>
        <SellerStoreGate>
          <SellerGoalsProvider>
            <DashboardLayout portal="seller">{children}</DashboardLayout>
          </SellerGoalsProvider>
        </SellerStoreGate>
      </SellerDataProvider>
    </PortalGuard>
  );
}
