"use client";

import Link from "next/link";
import { ArrowRight, Bike, Clock, MapPin, Navigation, Package, Store, Warehouse, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LegActions } from "@/components/warehouse/leg-actions";
import { useLocale } from "@/context/locale-context";
import { useOpsPath } from "@/lib/ops-path";
import {
  LEG_KIND,
  LEG_STATUS,
  endpointName,
  fmtDateTime,
  legItemsText,
  legStatusVariant,
  mapsLink,
  pickL,
  type Endpoint,
  type TaskView,
} from "@/lib/logistics";
import { legAgeHours, parcelCode, riderLabel, isOpenLeg, type DeskTask } from "@/lib/warehouse";
import { runBadgeText } from "@/lib/warehouse-runs";
import { formatCurrency } from "@/lib/utils";

function EndpointIcon({ e }: { e: Endpoint | null }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (e?.type === "seller") return <Store className={cls} />;
  if (e?.type === "customer") return <User className={cls} />;
  return <Warehouse className={cls} />;
}

/** "Seller → Origin hub" with an icon per end. */
export function LegRoute({ task }: { task: Pick<TaskView, "from" | "to"> }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
      <EndpointIcon e={task.from} />
      <span className="font-medium">{endpointName(task.from, fr)}</span>
      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
      <EndpointIcon e={task.to} />
      <span className="font-medium">{endpointName(task.to, fr)}</span>
    </span>
  );
}

export function LegBadges({ task }: { task: TaskView }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <>
      <Badge variant="primary">{pickL(LEG_KIND[task.kind], fr)}</Badge>
      <Badge variant={legStatusVariant(task.status)}>{pickL(LEG_STATUS[task.status], fr)}</Badge>
      {task.attempts > 1 && <Badge variant="warning">{fr ? `Tentative ${task.attempts}` : `Attempt ${task.attempts}`}</Badge>}
      {task.codAmountUsd > 0 && <Badge variant="purple">COD {formatCurrency(task.codAmountUsd, fr ? "fr" : "en")}</Badge>}
      {task.collectOld && <Badge variant="info">{fr ? "Reprise de l'ancien article" : "Collect the old unit"}</Badge>}
      {runBadgeText(task, fr) && <Badge variant="purple">{runBadgeText(task, fr)}</Badge>}
    </>
  );
}

/** One leg on the desk / custody lists: what, where to where, who carries it, and the buttons that apply. */
export function LegCard({ task, onChanged }: { task: DeskTask; onChanged?: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const age = legAgeHours(task);
  const link = mapsLink(task.from, task.to);
  return (
    <div className="card-premium p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={ops(`/tasks/${task.id}`)} className="font-semibold text-[var(--primary)] hover:underline">
              {task.orderReference}
            </Link>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{parcelCode(task)}</span>
            <LegBadges task={task} />
          </div>
          <LegRoute task={task} />
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{legItemsText(task.items, fr)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Bike className="h-3.5 w-3.5" />
              {riderLabel(task, fr)}
            </span>
            {task.sellerName && (
              <span className="inline-flex items-center gap-1">
                <Store className="h-3.5 w-3.5" />
                {task.sellerName}
              </span>
            )}
            <span className="inline-flex items-center gap-1" title={fmtDateTime(task.createdAt, fr)}>
              <Clock className="h-3.5 w-3.5" />
              {isOpenLeg(task) ? (age < 48 ? `${Math.round(age)} h` : `${Math.floor(age / 24)} ${fr ? "j" : "d"}`) : fmtDateTime(task.deliveredAt ?? task.updatedAt, fr)}
            </span>
            {task.to?.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {task.to.address}
              </span>
            )}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">
                <Navigation className="h-3.5 w-3.5" />
                {fr ? "Itinéraire" : "Route"}
              </a>
            )}
          </div>
          {task.failureReason && (
            <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
              {fr ? "Motif d'échec : " : "Failure reason: "}
              {task.failureReason}
            </p>
          )}
        </div>
        <LegActions task={task} onChanged={onChanged} size="sm" />
      </div>
    </div>
  );
}
