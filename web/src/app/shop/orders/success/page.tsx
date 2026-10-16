"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageLoader } from "@/components/ui/loader";

/** Legacy URL: send the shopper to the real order confirmation (or their orders). */
function SuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("order");

  useEffect(() => {
    router.replace(orderId ? `/shop/orders/${encodeURIComponent(orderId)}/confirmed` : "/shop/orders");
  }, [orderId, router]);

  return <PageLoader className="py-16" />;
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<PageLoader className="py-16" />}>
      <SuccessContent />
    </Suspense>
  );
}
