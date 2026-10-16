"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui/loader";

/** Disputes and returns share one live status page. */
export default function ShopDisputePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/shop/returns/${encodeURIComponent(id)}`);
  }, [id, router]);
  return <PageLoader className="py-16" />;
}
