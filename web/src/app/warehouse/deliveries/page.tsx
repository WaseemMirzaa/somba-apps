"use client";

import { useState } from "react";
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

const TYPE_BADGE: Record<DeliveryType, "primary" | "info" | "warning" | "default"> = {
  local: "default",
  cross_zone: "primary",
  inter_warehouse: "info",
  return: "warning",
};

export default function WarehouseDeliveriesPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [tab, setTab] = useState<DeliveryType | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  const counts = deliveryTypeCounts();
  const tabs = [
    { id: "all", label: `${fr ? "Tous" : "All"} (${WAREHOUSE_PARCELS.length})` },
    { id: "local", label: `${DELIVERY_TYPE_SHORT.local[fr ? "fr" : "en"]} (${counts.local})` },
    { id: "cross_zone", label: `${DELIVERY_TYPE_SHORT.cross_zone[fr ? "fr" : "en"]} (${counts.cross_zone})` },
    { id: "inter_warehouse", label: `${DELIVERY_TYPE_SHORT.inter_warehouse[fr ? "fr" : "en"]} (${counts.inter_warehouse})` },
    { id: "return", label: `${DELIVERY_TYPE_SHORT.return[fr ? "fr" : "en"]} (${counts.return})` },
  ];

  const parcels: WarehouseParcel[] =
    tab === "all" ? WAREHOUSE_PARCELS : WAREHOUSE_PARCELS.filter((p) => p.type === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Livraisons par type" : "Deliveries by type"}
        subtitle={
          fr
            ? "Files séparées par type d'acheminement : local (même zone), inter-zone (même entrepôt), inter-entrepôts et retours"
            : "Separate queues per delivery type: local (same zone), cross-zone (same warehouse), inter-warehouse, and returns"
        }
        breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: fr ? "Livraisons" : "Deliveries" }]}
      />

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as DeliveryType | "all")} />

      <div className="space-y-3">
        {parcels.map((p) => {
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
                        href="/warehouse/transfers"
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
      </div>
    </div>
  );
}
