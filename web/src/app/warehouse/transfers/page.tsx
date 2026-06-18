"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { StatCard } from "@/components/ui/stat-card";
import { Truck, ArrowRight, ChevronDown, MapPin, User } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { ParcelJourney } from "@/components/warehouse/parcel-journey";
import {
  TRANSFER_RUNS,
  TRANSFER_STATUS_LABELS,
  parcelsForTransfer,
  type TransferStatus,
} from "@/lib/warehouse-transfers";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<TransferStatus, "success" | "info" | "warning" | "default"> = {
  scheduled: "default",
  loading: "warning",
  in_transit: "info",
  arrived: "warning",
  received: "success",
};

export default function WarehouseTransfersPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [tab, setTab] = useState<"all" | "outbound" | "return">("all");
  const [open, setOpen] = useState<string | null>("TR-9001");

  const runs = TRANSFER_RUNS.filter((r) => tab === "all" || r.direction === tab);
  const inTransit = TRANSFER_RUNS.filter((r) => r.status === "in_transit").length;
  const scheduled = TRANSFER_RUNS.filter((r) => r.status === "scheduled").length;
  const parcelsMoving = TRANSFER_RUNS.reduce((n, r) => n + r.parcelIds.length, 0);

  const tabs = [
    { id: "all", label: fr ? "Tous" : "All" },
    { id: "outbound", label: fr ? "Sortants (vente)" : "Outbound (fulfilment)" },
    { id: "return", label: fr ? "Retours" : "Returns" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Transferts inter-entrepôts" : "Inter-warehouse Transfers"}
        subtitle={
          fr
            ? "Liaisons longue distance entre hubs — un colis voyage d'un entrepôt (zone A) vers un autre (zone B), puis livraison dernier km au client"
            : "Line-haul legs between hubs — a parcel travels from one warehouse (zone A) to another (zone B), then last-mile to the customer"
        }
        breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: fr ? "Transferts" : "Transfers" }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "En transit" : "In transit"} value={inTransit} icon={Truck} />
        <StatCard title={fr ? "Planifiés" : "Scheduled"} value={scheduled} icon={Truck} />
        <StatCard title={fr ? "Colis en mouvement" : "Parcels moving"} value={parcelsMoving} icon={ArrowRight} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as typeof tab)} />

      <div className="space-y-3">
        {runs.map((run) => {
          const parcels = parcelsForTransfer(run.id);
          const isOpen = open === run.id;
          return (
            <Card key={run.id}>
              <CardContent className="p-0">
                <button
                  onClick={() => setOpen(isOpen ? null : run.id)}
                  className="flex w-full flex-wrap items-center gap-3 p-5 text-left"
                >
                  <span className="rounded-lg bg-slate-100 p-2">
                    <Truck className="h-5 w-5 text-slate-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{run.id}</span>
                      <Badge variant={run.direction === "return" ? "warning" : "info"}>
                        {run.direction === "return" ? (fr ? "Retour" : "Return") : (fr ? "Sortant" : "Outbound")}
                      </Badge>
                      <Badge variant={STATUS_VARIANT[run.status]}>
                        {fr ? TRANSFER_STATUS_LABELS[run.status].fr : TRANSFER_STATUS_LABELS[run.status].en}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{run.fromWarehouse} · {run.fromZone}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      <span>{run.toWarehouse} · {run.toZone}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p className="flex items-center justify-end gap-1"><User className="h-3 w-3" />{run.driver}</p>
                    <p>{run.vehicle}</p>
                    <p>{fr ? "Départ" : "Depart"} {run.departAt} · ETA {run.eta}</p>
                  </div>
                  <ChevronDown className={cn("h-5 w-5 text-slate-400 transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--border)] p-5">
                    <div className="mb-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => toast(fr ? `${run.id} marqué arrivé` : `${run.id} marked arrived`, "info")}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                      >
                        {fr ? "Marquer arrivé" : "Mark arrived"}
                      </button>
                      <button
                        onClick={() => toast(fr ? `Colis de ${run.id} reçus au hub` : `${run.id} parcels received at hub`)}
                        className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
                      >
                        {fr ? "Réceptionner au hub" : "Receive at destination hub"}
                      </button>
                    </div>

                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {parcels.length} {fr ? "colis dans ce transfert" : "parcels in this transfer"}
                    </p>
                    {parcels.length === 0 ? (
                      <p className="text-sm text-slate-400">{fr ? "Aucun colis encore affecté." : "No parcels assigned yet."}</p>
                    ) : (
                      <div className="space-y-4">
                        {parcels.map((p) => (
                          <div key={p.id} className="rounded-xl border border-[var(--border)] p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm">
                              <span className="font-medium text-slate-900">{p.orderId}</span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-600">{p.customer}</span>
                            </div>
                            <ParcelJourney legs={p.legs} currentLeg={p.currentLeg} fr={fr} />
                          </div>
                        ))}
                      </div>
                    )}
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
