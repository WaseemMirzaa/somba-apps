"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { ArrowRight, ChevronDown, MapPin, Truck } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { ParcelJourney } from "@/components/warehouse/parcel-journey";
import {
  WAREHOUSE_PARCELS,
  DELIVERY_TYPE_SHORT,
  deliveryTypeCounts,
  type DeliveryType,
  type WarehouseParcel,
} from "@/lib/warehouse-transfers";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/ui/data-table";
import { STAGE_LABEL, stageVariant, useWarehouseData, type ParcelStage } from "@/lib/warehouse";
import { shortDate } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";

const TYPE_BADGE: Record<DeliveryType, "primary" | "info" | "warning" | "default"> = {
  local: "default",
  cross_zone: "primary",
  inter_warehouse: "info",
  return: "warning",
};

export default function WarehouseDeliveriesPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { parcels: liveParcels } = useWarehouseData();
  const [view, setView] = useState<"live" | "demo">("live");
  const [tab, setTab] = useState<DeliveryType | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const live = useMemo(() => liveParcels.filter((p) => p.status !== "inbound" && p.status !== "received"), [liveParcels]);

  const counts = deliveryTypeCounts();
  const tabs = [
    { id: "all", label: `${fr ? "Tous" : "All"} (${WAREHOUSE_PARCELS.length})` },
    { id: "local", label: `${DELIVERY_TYPE_SHORT.local[fr ? "fr" : "en"]} (${counts.local})` },
    { id: "cross_zone", label: `${DELIVERY_TYPE_SHORT.cross_zone[fr ? "fr" : "en"]} (${counts.cross_zone})` },
    { id: "inter_warehouse", label: `${DELIVERY_TYPE_SHORT.inter_warehouse[fr ? "fr" : "en"]} (${counts.inter_warehouse})` },
    { id: "return", label: `${DELIVERY_TYPE_SHORT.return[fr ? "fr" : "en"]} (${counts.return})` },
  ];

  const demoParcels: WarehouseParcel[] =
    tab === "all" ? WAREHOUSE_PARCELS : WAREHOUSE_PARCELS.filter((p) => p.type === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Livraisons" : "Deliveries"}
        subtitle={
          fr
            ? "Suivi en direct des livraisons : en route, livrées et échouées"
            : "Live delivery tracking: on the way, delivered and failed"
        }
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Livraisons" : "Deliveries" }]}
      />

      <Tabs
        tabs={[
          { id: "live", label: `${fr ? "En direct" : "Live"} (${live.length})` },
          { id: "demo", label: fr ? "Par type (données démo)" : "By type (demo data)" },
        ]}
        active={view}
        onChange={(id) => setView(id as "live" | "demo")}
      />

      {view === "live" && (
        <Card>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucune livraison en cours." : "No deliveries yet."}
              columns={[
                { key: "id", label: fr ? "Colis" : "Parcel", render: (row) => (
                  <Link href={ops(`/deliveries/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
                )},
                { key: "orderId", label: fr ? "Commande" : "Order" },
                { key: "customer", label: fr ? "Client" : "Customer" },
                { key: "customerAddress", label: fr ? "Adresse" : "Address" },
                { key: "rider", label: fr ? "Livreur" : "Rider" },
                { key: "attempts", label: fr ? "Tentatives" : "Attempts" },
                { key: "status", label: fr ? "Statut" : "Status", render: (row) => {
                  const st = String(row.status) as ParcelStage;
                  return <Badge variant={stageVariant(st)}>{fr ? STAGE_LABEL[st].fr : STAGE_LABEL[st].en}</Badge>;
                }},
                { key: "updatedAt", label: fr ? "Mis à jour" : "Updated", render: (row) => shortDate(String(row.updatedAt), locale) },
              ]}
              data={live as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      )}

      {view === "demo" && (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="warning">{fr ? "Données démo" : "Demo data"}</Badge>
            <span className="text-xs text-slate-500">
              {fr ? "Le serveur ne suit pas encore le type d'acheminement (local, inter-zone, inter-entrepôts, retour)." : "The server does not track delivery type (local, cross-zone, inter-warehouse, return) yet."}
            </span>
          </div>
          <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as DeliveryType | "all")} />
        </>
      )}

      {view === "demo" && <div className="space-y-3">
        {demoParcels.map((p) => {
          const isOpen = open === p.id;
          const delivered = p.statusFr.includes("Livré") || p.status.toLowerCase().includes("deliver");
          return (
            <Card key={p.id}>
              <CardContent className="p-0">
                <button
                  onClick={() => setOpen(isOpen ? null : p.id)}
                  className="flex w-full flex-wrap items-center gap-3 p-5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{p.orderId}</span>
                      <Badge variant={TYPE_BADGE[p.type]}>
                        {fr ? DELIVERY_TYPE_SHORT[p.type].fr : DELIVERY_TYPE_SHORT[p.type].en}
                      </Badge>
                      <span className="text-sm text-slate-500">· {p.customer}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{p.originWarehouse} · {p.originZone}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      {p.destinationWarehouse && p.destinationWarehouseId !== p.originWarehouseId && (
                        <>
                          <span>{p.destinationWarehouse}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                        </>
                      )}
                      <span>{fr ? "Client" : "Customer"} · {p.destinationZone}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <Badge variant={delivered ? "success" : "info"}>{fr ? p.statusFr : p.status}</Badge>
                    {p.transferId && (
                      <Link
                        href={ops("/transfers")}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 flex items-center justify-end gap-1 text-[var(--primary)] hover:underline"
                      >
                        <Truck className="h-3 w-3" />{p.transferId}
                      </Link>
                    )}
                  </div>
                  <ChevronDown className={cn("h-5 w-5 text-slate-400 transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--border)] p-5">
                    <ParcelJourney legs={p.legs} currentLeg={p.currentLeg} fr={fr} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>}
    </div>
  );
}
