"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { OpsLoading } from "@/components/warehouse/ops-state";
import { BinsTab } from "@/components/warehouse/stock/bins";
import { CountTab } from "@/components/warehouse/stock/count";
import { CustodyTab } from "@/components/warehouse/stock/custody";
import { HistoryTab } from "@/components/warehouse/stock/history";
import { MoveOutTab } from "@/components/warehouse/stock/move-out";
import { OnHandTab } from "@/components/warehouse/stock/on-hand";
import { ReceiveTab } from "@/components/warehouse/stock/receive";
import { useLocale } from "@/context/locale-context";
import { useOpsBase } from "@/lib/ops-path";

const TAB_IDS = ["onhand", "receive", "move", "count", "history", "bins", "custody"] as const;
type TabId = (typeof TAB_IDS)[number];

/**
 * The warehouse stock ledger: what the warehouse holds by SKU and bin, receiving (from a scanned parcel or by hand), moves,
 * cycle counts, stock-outs and the history, plus the older read-only view of the parcels in custody. Everything is live and
 * every change is a ledger line (who, when, how many, from / to which bin, why).
 */
function InventoryContent() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const base = useOpsBase();
  const params = useSearchParams();
  const asked = params.get("tab") as TabId | null;
  const [tab, setTab] = useState<TabId>(asked && TAB_IDS.includes(asked) ? asked : "onhand");

  const tabs: { id: TabId; label: string }[] = [
    { id: "onhand", label: fr ? "En stock" : "On hand" },
    { id: "receive", label: fr ? "Réception" : "Receive" },
    { id: "move", label: fr ? "Déplacer / sortir" : "Move / out" },
    { id: "count", label: fr ? "Comptage" : "Count" },
    { id: "history", label: fr ? "Historique" : "History" },
    { id: "bins", label: fr ? "Emplacements" : "Bins" },
    { id: "custody", label: fr ? "Colis en garde" : "In custody" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={fr ? "Inventaire" : "Inventory"}
        subtitle={fr ? "Le stock de l'entrepôt par SKU et par emplacement, avec chaque mouvement enregistré." : "What the warehouse holds by SKU and bin, with every movement on record."}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Inventaire" : "Inventory" }]}
      />
      <HubScopeBar />
      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />
      {tab === "onhand" && <OnHandTab />}
      {tab === "receive" && <ReceiveTab />}
      {tab === "move" && <MoveOutTab />}
      {tab === "count" && <CountTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "bins" && <BinsTab />}
      {tab === "custody" && <CustodyTab />}
    </div>
  );
}

export default function WarehouseInventoryPage() {
  return (
    <Suspense fallback={<OpsLoading />}>
      <InventoryContent />
    </Suspense>
  );
}
