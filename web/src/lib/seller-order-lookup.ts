"use client";

import { useCallback, useEffect, useState } from "react";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";

/**
 * One seller order for a detail or label page. The provider's list holds the newest orders only; an older order opens
 * through the SERVER (`orders:sellerList { id }`), so "Order not found" means the order really is not theirs, never "not among
 * the newest 200". `load` has the shape `<MissingRecord>` expects.
 */
export function useSellerOrder(id: string) {
  const { getSellerOrder, lookupSellerOrder, load } = useSellerData();
  const order = getSellerOrder(id);
  const [state, setState] = useState<{ id: string; phase: "looking" | "missing" | "error"; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (order || load.loading || !id) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ id, phase: "looking" });
    lookupSellerOrder(id).then(
      (found) => {
        if (live) setState(found ? null : { id, phase: "missing" });
      },
      (e) => {
        if (live) setState({ id, phase: "error", error: errMessage(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [order, load.loading, id, attempt, lookupSellerOrder]);

  const retry = useCallback(async () => {
    setAttempt((n) => n + 1);
    await load.retry();
  }, [load]);

  const mine = state && state.id === id ? state : null;
  return {
    order,
    load: {
      loading: !order && (load.loading || mine?.phase === "looking"),
      error: order ? null : (mine?.phase === "error" ? (mine.error ?? null) : load.error),
      retry,
    },
  };
}
