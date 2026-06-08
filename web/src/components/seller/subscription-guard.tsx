"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useSellerSubscription } from "@/context/seller-subscription-context";

export function SellerSubscriptionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { persona } = useAuth();
  const { hasActiveSubscription, subscriptionReady } = useSellerSubscription();

  const isSubscribeRoute = pathname === "/seller/subscribe" || pathname.startsWith("/seller/subscribe/");
  const needsSubscription = persona.role === "seller" && !isSubscribeRoute;
  const subscribed = hasActiveSubscription(persona.id);

  useEffect(() => {
    if (!subscriptionReady) return;
    if (needsSubscription && !subscribed) {
      router.replace("/seller/subscribe");
    }
  }, [needsSubscription, subscribed, router, subscriptionReady]);

  if (!subscriptionReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (needsSubscription && !subscribed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Checking subscription…
      </div>
    );
  }

  return <>{children}</>;
}
