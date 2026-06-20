"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { useSellerSubscription } from "@/context/seller-subscription-context";
import { useModeration } from "@/context/moderation-context";
import { PageLoader } from "@/components/ui/loader";
import { Ban } from "lucide-react";

export function SellerSubscriptionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { persona } = useAuth();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { hasActiveSubscription, subscriptionReady } = useSellerSubscription();
  const { isStoreBlocked } = useModeration();

  // A seller whose store has been blocked by admin/moderation is locked out.
  if (persona.role === "seller" && isStoreBlocked(persona.name)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
        <div className="max-w-md space-y-4 rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <Ban className="h-7 w-7 text-red-600" />
          </span>
          <h1 className="text-xl font-bold text-slate-900">{fr ? "Compte bloqué" : "Account blocked"}</h1>
          <p className="text-sm text-slate-500">
            {fr
              ? "Votre boutique a été suspendue par l'administration. Vos produits ne sont plus visibles. Contactez le support pour plus d'informations."
              : "Your store has been blocked by the administration. Your products are no longer visible. Please contact support for more information."}
          </p>
          <a href="mailto:support@somba.com" className="inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
            {fr ? "Contacter le support" : "Contact support"}
          </a>
        </div>
      </div>
    );
  }

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
