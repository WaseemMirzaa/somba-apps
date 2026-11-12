"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { ParcelContents } from "@/components/parcel/parcel-contents";
import { useLocale } from "@/context/locale-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSocketEvent } from "@/lib/seller-api";
import { boxText } from "@/lib/parcel-labels";
import type { ParcelContentLine } from "@/lib/parcel-labels";

interface OrderBox {
  code: string;
  boxNo: number;
  boxCount: number;
  voided: boolean;
  storeName: string | null;
  pickupScans: number;
  dropoffScans: number;
  lastScanAt: string | null;
}

interface OrderParcelSet {
  groupId: string | null;
  orders: { orderId: string; reference: string }[];
  locked: boolean;
  contentsRev: number;
  contents: ParcelContentLine[];
  boxes: OrderBox[];
}

/** `parcels:forOrder`: the label sets of an order, their boxes, scans and contents. */
export function OrderParcels({ orderId, ordersHref = (id: string) => `/admin/orders/${id}` }: { orderId: string; ordersHref?: (orderId: string) => string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [sets, setSets] = useState<OrderParcelSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await socketClient.request<{ sets: OrderParcelSet[] }>("parcels:forOrder", { orderId });
      setSets(res.sets ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the parcels when the page opens
    void load();
  }, [load]);
  // A scan anywhere ticks the boxes at once.
  useSocketEvent(["parcel:scanned", "task:updated"], () => void load());

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-700">{error}</p>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700">{fr ? "Réessayer" : "Retry"}</button>
      </div>
    );
  }
  if (!sets) return <p className="text-sm text-slate-500" role="status">{fr ? "Chargement des colis…" : "Loading the parcels…"}</p>;
  if (sets.length === 0) return <p className="text-sm text-slate-500" data-testid="no-parcels">{fr ? "Aucune étiquette n'a encore été créée : le vendeur n'a pas marqué le colis prêt." : "No labels yet: the seller has not marked the package ready."}</p>;

  return (
    <div className="space-y-4" data-testid="order-parcels">
      {sets.map((set, i) => (
        <div key={set.groupId ?? i} className="space-y-2">
          {set.orders.length > 1 && (
            <p className="text-xs text-slate-600" data-testid="parcel-set-orders">
              {fr ? "Ces cartons contiennent aussi les commandes :" : "These boxes also hold the orders:"}{" "}
              {set.orders.map((o, k) => (
                <span key={o.orderId}>
                  {k > 0 && ", "}
                  {o.orderId === orderId ? <strong>{o.reference}</strong> : <Link href={ordersHref(o.orderId)} className="text-[var(--primary)] hover:underline">{o.reference}</Link>}
                </span>
              ))}
              {set.locked ? (fr ? " · collectés" : " · collected") : ""}
            </p>
          )}
          <ul className="space-y-1">
            {set.boxes.map((b) => (
              <li key={b.code} className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${b.voided ? "opacity-50" : ""}`} data-testid="order-box">
                <span className="text-slate-700">{boxText(b.boxNo, b.boxCount, fr)}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{b.code}</span>
                {b.storeName && <span className="text-xs text-slate-500">{b.storeName}</span>}
                {b.voided ? (
                  <span className="text-xs font-medium text-red-700">{fr ? "étiquette annulée" : "label void"}</span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">{b.pickupScans > 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />}{fr ? "collecte" : "pickup"}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">{b.dropoffScans > 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />}{fr ? "remise" : "drop-off"}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <ParcelContents contents={set.contents} orders={set.orders} />
        </div>
      ))}
    </div>
  );
}
