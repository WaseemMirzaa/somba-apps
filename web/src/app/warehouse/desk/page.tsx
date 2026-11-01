"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LegCard } from "@/components/warehouse/leg-card";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { ScanInput } from "@/components/warehouse/scan-input";
import { OpsError, OpsLoading } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { LEG_KIND_SHORT, LEG_STATUS, legItemsText, pickL, type LegKind } from "@/lib/logistics";
import { deskActions, parcelCode, useDeskQueue, useHubScope, type DeskTask } from "@/lib/warehouse";
import { errorMessage } from "@/lib/warehouse-live";
import { cn } from "@/lib/utils";

type TabId = "pickup" | "transfer_out" | "transfer_in" | "transfer" | "delivery" | "return_pickup" | "replacement_delivery" | "return_transfer" | "return_to_seller";

const STATUS_FILTERS = ["open", "all", "unassigned", "assigned", "picked_up", "in_transit", "delivered", "failed"] as const;

function DeskContent() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const params = useSearchParams();
  const ops = useOpsPath();
  const base = useOpsBase();
  const { toast } = useToast();
  const { effectiveHubId, tier, isAdmin } = useHubScope();
  const [status, setStatus] = useState<string>("open");
  const [query, setQuery] = useState("");
  const kindParam = params.get("kind");
  const [tab, setTab] = useState<TabId>(
    (kindParam as TabId | null) && (kindParam === "transfer" || kindParam === "pickup" || kindParam === "delivery" || kindParam === "return_pickup" || kindParam === "replacement_delivery" || kindParam === "return_transfer" || kindParam === "return_to_seller")
      ? (kindParam as TabId)
      : "pickup",
  );
  const q = useDeskQueue({ status });

  // Tabs: transfers split into "out" / "in" when we know which warehouse we are.
  const tabs: { id: TabId; kind: LegKind; label: string; match: (t: DeskTask) => boolean }[] = useMemo(() => {
    const me = effectiveHubId;
    const list: { id: TabId; kind: LegKind; label: string; match: (t: DeskTask) => boolean }[] = [
      { id: "pickup", kind: "pickup", label: pickL(LEG_KIND_SHORT.pickup, fr), match: (t) => t.kind === "pickup" },
    ];
    if (me) {
      list.push(
        { id: "transfer_out", kind: "transfer", label: fr ? "Transferts sortants" : "Transfers out", match: (t) => t.kind === "transfer" && t.fromHubId === me },
        { id: "transfer_in", kind: "transfer", label: fr ? "Transferts entrants" : "Transfers in", match: (t) => t.kind === "transfer" && t.toHubId === me },
      );
    } else {
      list.push({ id: "transfer", kind: "transfer", label: pickL(LEG_KIND_SHORT.transfer, fr), match: (t) => t.kind === "transfer" });
    }
    list.push(
      { id: "delivery", kind: "delivery", label: pickL(LEG_KIND_SHORT.delivery, fr), match: (t) => t.kind === "delivery" },
      { id: "return_pickup", kind: "return_pickup", label: pickL(LEG_KIND_SHORT.return_pickup, fr), match: (t) => t.kind === "return_pickup" },
      { id: "replacement_delivery", kind: "replacement_delivery", label: pickL(LEG_KIND_SHORT.replacement_delivery, fr), match: (t) => t.kind === "replacement_delivery" },
      { id: "return_transfer", kind: "return_transfer", label: pickL(LEG_KIND_SHORT.return_transfer, fr), match: (t) => t.kind === "return_transfer" },
      { id: "return_to_seller", kind: "return_to_seller", label: pickL(LEG_KIND_SHORT.return_to_seller, fr), match: (t) => t.kind === "return_to_seller" },
    );
    return list;
  }, [effectiveHubId, fr]);

  const activeTab = tabs.find((x) => x.id === tab) ?? (tab === "transfer" ? tabs.find((x) => x.kind === "transfer") : undefined) ?? tabs[0];

  const needle = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      q.tasks
        .filter((t) => activeTab.match(t))
        .filter(
          (t) =>
            !needle ||
            [t.orderReference, parcelCode(t), t.riderName ?? "", t.sellerName ?? "", t.to?.name ?? "", t.from?.name ?? "", legItemsText(t.items, fr)]
              .join(" ")
              .toLowerCase()
              .includes(needle),
        )
        .sort((a, b) => Number(!!b.desk.scanIn || !!b.desk.assign) - Number(!!a.desk.scanIn || !!a.desk.assign) || +new Date(a.createdAt) - +new Date(b.createdAt)),
    [q.tasks, activeTab, needle, fr],
  );

  async function onScan(leg: DeskTask) {
    if (leg.desk.scanIn) {
      try {
        const res = await deskActions.scanIn(leg.id);
        const next = res.next?.length ? (fr ? ` — ${res.next.length} trajet(s) créé(s)` : ` — ${res.next.length} leg(s) created`) : "";
        toast((fr ? `${parcelCode(leg)} scanné à l'arrivée` : `${parcelCode(leg)} scanned in`) + next);
        void q.reload();
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    } else if (leg.desk.scanOut) {
      try {
        await deskActions.scanOut(leg.id);
        toast(fr ? `${parcelCode(leg)} remis au livreur` : `${parcelCode(leg)} handed to the rider`);
        void q.reload();
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    } else {
      router.push(ops(`/tasks/${leg.id}`));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={fr ? "Bureau de l'entrepôt" : "Hub desk"}
        subtitle={
          fr
            ? "Collectes, transferts, livraisons et retours de votre entrepôt. Scannez un colis pour l'enregistrer à l'arrivée ou le remettre au livreur."
            : "Your warehouse's pickups, transfers, deliveries and returns. Scan a parcel to receive it or hand it to its rider."
        }
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Bureau" : "Desk" }]}
        actions={<ScanInput legs={q.tasks} onFound={onScan} autoFocus buttonLabel={fr ? "Scanner" : "Scan"} />}
      />
      <HubScopeBar />
      {tier === "operator" && !isAdmin && (
        <p className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm text-blue-800">
          {fr ? "Niveau opérateur : vous scannez les colis. Les superviseurs et les responsables assignent les livreurs." : "Operator level: you scan parcels. Supervisors and managers assign riders."}
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1" role="tablist">
        {tabs.map((tb) => {
          const count = q.tasks.filter((t) => tb.match(t)).length;
          const active = tb.id === activeTab.id;
          return (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tb.id)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                active ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {tb.label}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", count > 0 ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500")}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-premium w-72 py-2 pl-9 pr-3 text-sm"
            placeholder={fr ? "Commande, colis, vendeur, livreur…" : "Order, parcel, seller, rider…"}
            aria-label={fr ? "Rechercher" : "Search"}
          />
        </div>
        <select aria-label={fr ? "Statut" : "Status"} value={status} onChange={(e) => setStatus(e.target.value)} className="input-premium px-3 py-2 text-sm">
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "open" ? (fr ? "En cours" : "Open") : s === "all" ? (fr ? "Tous les statuts" : "All statuses") : pickL(LEG_STATUS[s], fr)}
            </option>
          ))}
        </select>
      </div>

      {(activeTab.id === "transfer_out" || activeTab.id === "transfer") && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm text-blue-800" data-testid="desk-runs-hint">
          {fr ? "Plusieurs colis partent vers le même entrepôt ? Regroupez-les dans une tournée avec un seul chauffeur." : "Several parcels leaving for the same warehouse? Group them in a run with one driver."}
          <Link href={ops("/runs")} className="font-semibold underline">{fr ? "Ouvrir les tournées de transfert" : "Open transfer runs"}</Link>
        </p>
      )}

      {q.error && <OpsError message={q.error} onRetry={() => void q.reload()} />}
      {q.loading ? (
        <OpsLoading />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          {fr ? "Aucun colis dans cet onglet." : "No parcels in this tab."}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <LegCard key={t.id} task={t} onChanged={() => void q.reload()} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WarehouseDeskPage() {
  return (
    <Suspense fallback={<OpsLoading />}>
      <DeskContent />
    </Suspense>
  );
}
