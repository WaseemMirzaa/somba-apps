"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OpsLoading } from "@/components/warehouse/ops-state";
import { useOpsPath } from "@/lib/ops-path";

/** A retired page now lives somewhere else (the hub desk replaced inbound / receiving / sorting / dispatch / deliveries). */
export function OpsRedirect({ to }: { to: string }) {
  const ops = useOpsPath();
  const router = useRouter();
  const target = ops(to);
  useEffect(() => {
    router.replace(target);
  }, [router, target]);
  return <OpsLoading />;
}
