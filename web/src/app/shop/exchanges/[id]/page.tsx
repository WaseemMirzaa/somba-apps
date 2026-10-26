"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { ExchangeStatusView, SwapNotFound } from "@/components/shop/swap-status";
import { useMyExchanges, type ExchangeRow } from "@/lib/after-sale";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";

function Page() {
  const { id } = useParams<{ id: string }>();
  const rt = useRealtime();
  const { rows, loaded } = useMyExchanges();
  const [fetched, setFetched] = useState<ExchangeRow | null>(null);
  const [tried, setTried] = useState(false);
  const live = rows.find((r) => r.id === id || r.reference === id);
  useEffect(() => {
    if (live || rt.status !== "connected") return;
    let alive = true;
    socketClient.request<ExchangeRow>("exchanges:get", { id }).then((r) => alive && setFetched(r)).catch(() => {}).finally(() => alive && setTried(true));
    return () => {
      alive = false;
    };
  }, [id, live, rt.status]);
  const row = live ?? fetched;
  return row ? <ExchangeStatusView r={row} /> : <SwapNotFound loaded={loaded && tried} />;
}

export default function ExchangeStatusPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/exchanges/${id}`}>
      <Page />
    </RequireSignIn>
  );
}
