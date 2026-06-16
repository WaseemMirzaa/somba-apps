"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { useSellerSubscription } from "@/context/seller-subscription-context";
import { PageLoader } from "@/components/ui/loader";

export function SellerSubscriptionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { persona } = useAuth();
  const { locale } = useLocale();
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
    return <PageLoader locale={locale} />;
  }

  if (needsSubscription && !subscribed) {
    return (
      <PageLoader
        locale={locale}
        label="Checking subscription…"
        labelFr="Vérification de l'abonnement…"
      />
    );
  }

  return <>{children}</>;
}
