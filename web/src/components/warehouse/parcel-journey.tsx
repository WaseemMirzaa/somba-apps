"use client";

import { Truck, Bike, PackageCheck, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LEG_KIND_LABELS,
  LEG_STATUS_LABELS,
  type ParcelLeg,
} from "@/lib/warehouse-transfers";

const LEG_ICON = {
  pickup: PackageCheck,
  line_haul: Truck,
  last_mile: Bike,
} as const;

const STATUS_DOT: Record<ParcelLeg["status"], string> = {
  done: "bg-emerald-500",
  in_progress: "bg-blue-500 ring-4 ring-blue-100",
  pending: "bg-slate-300",
};

const STATUS_BADGE: Record<ParcelLeg["status"], string> = {
  done: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-blue-50 text-blue-700",
  pending: "bg-slate-100 text-slate-500",
};

/** Renders a parcel's ordered legs as a vertical journey timeline. */
export function ParcelJourney({
  legs,
  currentLeg,
  fr,
}: {
  legs: ParcelLeg[];
  currentLeg: number;
  fr: boolean;
}) {
  return (
    <ol className="space-y-0">
      {legs.map((leg, i) => {
        const Icon = LEG_ICON[leg.kind];
        const isLast = i === legs.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", STATUS_DOT[leg.status])} />
              {!isLast && <span className="my-1 w-px flex-1 bg-slate-200" />}
            </div>
            <div className={cn("pb-4", i === currentLeg && "font-medium")}>
              <div className="flex flex-wrap items-center gap-2">
                <Icon className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-800">
                  {fr ? LEG_KIND_LABELS[leg.kind].fr : LEG_KIND_LABELS[leg.kind].en}
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[leg.status])}>
                  {fr ? LEG_STATUS_LABELS[leg.status].fr : LEG_STATUS_LABELS[leg.status].en}
                </span>
                {i === currentLeg && (
                  <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
                    {fr ? "Étape actuelle" : "Current leg"}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {leg.from} <span className="text-slate-400">→</span> {leg.to}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                {leg.carrierKind === "transfer"
                  ? `${fr ? "Transfert" : "Transfer"} ${leg.carrier}`
                  : `${fr ? "Livreur" : "Rider"}: ${leg.carrier}`}
                {" · ETA "}
                {leg.eta}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
