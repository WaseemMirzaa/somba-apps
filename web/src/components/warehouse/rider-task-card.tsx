"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Package, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { LEG_KIND, pickL } from "@/lib/logistics";
import type { RiderTask, RiderTaskStatus } from "@/lib/rider";

export const RIDER_STATUS_LABEL: Record<RiderTaskStatus, { en: string; fr: string }> = {
  assigned: { en: "Assigned", fr: "Assigné" },
  picked_up: { en: "Picked up", fr: "Collecté" },
  in_transit: { en: "On the way", fr: "En route" },
  delivered: { en: "Done", fr: "Terminé" },
  failed: { en: "Failed", fr: "Échoué" },
};

export function riderStatusVariant(s: RiderTaskStatus): "success" | "warning" | "info" | "danger" | "default" | "primary" {
  switch (s) {
    case "assigned":
      return "warning";
    case "picked_up":
    case "in_transit":
      return "info";
    case "delivered":
      return "success";
    case "failed":
      return "danger";
  }
}

export function RiderTaskCard({
  task,
  action,
}: {
  task: RiderTask;
  /** Optional button rendered in the card footer. */
  action?: React.ReactNode;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const label = RIDER_STATUS_LABEL[task.status];
  return (
    <div className="card-premium p-4">
      <Link href={`/rider/tasks/${task.id}`} className="block">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{task.orderId}</span>
          <Badge variant="primary">{pickL(LEG_KIND[task.kind], fr)}</Badge>
          <Badge variant={riderStatusVariant(task.status)}>{fr ? label.fr : label.en}</Badge>
          {task.attempts > 1 && <Badge variant="warning">{fr ? `Tentative ${task.attempts}` : `Attempt ${task.attempts}`}</Badge>}
          {task.codAmount > 0 && <Badge variant="purple">COD {formatCurrency(task.codAmount, locale)}</Badge>}
          {task.collectOld && <Badge variant="info">{fr ? "Reprise de l'ancien article" : "Collect the old unit"}</Badge>}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
          <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="font-medium">{task.fromName}</span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="font-medium">{task.toName}</span>
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{task.address}</span>
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
          <Store className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {fr ? "Départ : " : "From: "}
            {task.pickupAddress}
            {task.readyAt ? (fr ? " · prêt" : " · ready") : ""}
          </span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <Package className="h-3.5 w-3.5" />
          {task.legItemsText(fr) !== "—" ? task.legItemsText(fr) : `${task.items} ${fr ? "article(s)" : "item(s)"}`}
        </p>
      </Link>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
