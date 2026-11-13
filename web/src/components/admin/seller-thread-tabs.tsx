"use client";

import { useCallback, useEffect, useState } from "react";
import { DetailGridSection } from "@/components/ui/detail-grid";
import { CaseThreadPanel } from "@/components/shared/case-thread-panel";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { canManageSellerPortal, canReadSellerThread } from "@/lib/admin-controls";
import { useRole } from "@/lib/admin-live";
import type { CaseKind } from "@/lib/seller-aftersale";

/** Messages from the store that support has not read yet, for one case (live). */
function useSellerThreadUnread(kind: CaseKind, caseId: string, enabled: boolean): [number, () => void] {
  const rt = useRealtime();
  const [n, setN] = useState(0);
  const connected = rt.status === "connected";
  const load = useCallback(() => {
    if (!enabled) return;
    socketClient
      .request<{ cases: { kind: string; caseId: string; unread: number }[] }>("caseThread:unread")
      .then((r) => setN(r.cases.find((c) => c.kind === kind && c.caseId === caseId)?.unread ?? 0))
      .catch(() => undefined);
  }, [enabled, kind, caseId]);
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);
  useEffect(() => {
    if (!connected || !enabled) return;
    const sock = socketClient.current;
    if (!sock) return;
    const on = (m: { caseId?: string }) => {
      if (m?.caseId === caseId) load();
    };
    sock.on("caseThread:message", on);
    return () => {
      sock.off("caseThread:message", on);
    };
  }, [connected, enabled, caseId, load]);
  return [n, load];
}

/**
 * The conversation section of a return / exchange / replacement on the admin desk: the customer <-> support thread (children) and,
 * next to it, the private Seller thread (docs/contracts/admin-controls.md §13). Two panes side by side on wide screens, two tabs on
 * narrow ones, with an unread badge on the seller one. Visible to admin, operations, support (they write) and finance (reads).
 * Without a store on the case, or for another role, only the customer thread shows.
 */
export function ThreadTabs({
  kind,
  caseId,
  sellerId,
  customerTitle,
  children,
}: {
  kind: CaseKind;
  caseId: string;
  sellerId: string | null | undefined;
  customerTitle: string;
  children: React.ReactNode;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const role = useRole();
  const showSeller = !!sellerId && canReadSellerThread(role);
  const [tab, setTab] = useState<"customer" | "seller">("customer");
  const [unread, reload] = useSellerThreadUnread(kind, caseId, showSeller);

  if (!showSeller) {
    return (
      <DetailGridSection title={customerTitle} span={3}>
        {children}
      </DetailGridSection>
    );
  }
  const customerLabel = fr ? "Client ⟷ support" : "Customer ⟷ support";
  const sellerLabel = fr ? "Fil vendeur" : "Seller thread";
  return (
    <DetailGridSection title={fr ? "Conversations" : "Conversations"} span={3}>
      <div role="tablist" aria-label={fr ? "Conversations" : "Conversations"} className="mb-4 flex gap-2 lg:hidden">
        <button type="button" role="tab" aria-selected={tab === "customer"} onClick={() => setTab("customer")} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === "customer" ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-700"}`}>
          {customerLabel}
        </button>
        <button type="button" role="tab" aria-selected={tab === "seller"} data-testid="seller-thread-tab" onClick={() => setTab("seller")} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === "seller" ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-700"}`}>
          {sellerLabel}
          {unread > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{unread}</span>}
        </button>
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <div className={tab === "customer" ? "" : "hidden lg:block"} data-testid="customer-thread-pane">
          <h4 className="mb-3 hidden text-sm font-semibold text-slate-800 lg:block">{customerTitle}</h4>
          {children}
        </div>
        <div className={tab === "seller" ? "" : "hidden lg:block"} data-testid="seller-thread-pane">
          <h4 className="mb-3 hidden items-center gap-2 text-sm font-semibold text-slate-800 lg:flex">
            {sellerLabel}
            {unread > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{unread}</span>}
          </h4>
          <CaseThreadPanel kind={kind} caseId={caseId} side="support" canWrite={canManageSellerPortal(role)} onChanged={reload} />
        </div>
      </div>
    </DetailGridSection>
  );
}

/** An exchange or a replacement has no customer thread: its Seller thread is a section of its own (same roles as {@link ThreadTabs}). */
export function SellerThreadSection({ kind, caseId, sellerId }: { kind: CaseKind; caseId: string; sellerId: string | null | undefined }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const role = useRole();
  const [unread, reload] = useSellerThreadUnread(kind, caseId, !!sellerId && canReadSellerThread(role));
  if (!sellerId || !canReadSellerThread(role)) return null;
  return (
    <DetailGridSection
      title={`${fr ? "Fil vendeur" : "Seller thread"}${unread > 0 ? ` (${unread})` : ""}`}
      span={3}
    >
      <div data-testid="seller-thread-pane">
        <CaseThreadPanel kind={kind} caseId={caseId} side="support" canWrite={canManageSellerPortal(role)} onChanged={reload} />
      </div>
    </DetailGridSection>
  );
}
