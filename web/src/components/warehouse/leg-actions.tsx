"use client";

import { useState } from "react";
import { Bike, PackageCheck, PackageOpen } from "lucide-react";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { LEG_KIND, pickL, type TaskView } from "@/lib/logistics";
import { deskActions, parcelCode, useHubScope, type DeskTask } from "@/lib/warehouse";
import { errorMessage } from "@/lib/warehouse-live";

/**
 * The desk buttons of one leg, driven by the server's `desk` flags and the staff member's tier:
 * assign a rider (supervisor+), scan the parcel in at its destination warehouse, hand it over to its rider when it leaves.
 */
export function LegActions({
  task,
  onChanged,
  size = "md",
}: {
  task: DeskTask;
  onChanged?: (res?: { task?: TaskView; next?: TaskView[] }) => void;
  size?: "sm" | "md";
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { canAssign } = useHubScope();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const d = task.desk;
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";

  async function scanIn() {
    if (busy) return;
    setBusy("in");
    try {
      const res = await deskActions.scanIn(task.id);
      const created = res.next?.length ? res.next.map((n) => pickL(LEG_KIND[n.kind], fr)).join(", ") : null;
      toast(
        fr
          ? `${parcelCode(task)} scanné à l'arrivée${created ? ` — trajet créé : ${created}` : ""}`
          : `${parcelCode(task)} scanned in${created ? ` — leg created: ${created}` : ""}`,
      );
      onChanged?.(res);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function scanOut() {
    if (busy) return;
    setBusy("out");
    try {
      const res = await deskActions.scanOut(task.id);
      toast(fr ? `${parcelCode(task)} remis au livreur ${res.riderName ?? ""}`.trim() : `${parcelCode(task)} handed to rider ${res.riderName ?? ""}`.trim());
      onChanged?.({ task: res });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const canAssignNow = d?.assign && canAssign;
  const operatorHint = d?.assign && !canAssign;
  if (!d || (!d.assign && !d.scanIn && !d.scanOut)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {d.scanIn && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void scanIn()}
          className={`btn-primary inline-flex items-center gap-1.5 rounded-lg font-medium disabled:opacity-60 ${pad}`}
        >
          <PackageCheck className="h-4 w-4" />
          {busy === "in" ? "…" : fr ? "Scanner à l'arrivée" : "Scan in"}
        </button>
      )}
      {d.scanOut && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void scanOut()}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 ${pad}`}
        >
          <PackageOpen className="h-4 w-4" />
          {busy === "out" ? "…" : fr ? "Remettre au livreur" : "Hand to rider"}
        </button>
      )}
      {canAssignNow && (
        <>
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 font-medium text-indigo-700 hover:bg-indigo-50 ${pad}`}
          >
            <Bike className="h-4 w-4" />
            {task.riderId ? (fr ? "Changer de livreur" : "Change rider") : fr ? "Assigner un livreur" : "Assign rider"}
          </button>
          <AssignRiderModal
            open={assignOpen}
            taskId={task.id}
            selectedRiderId={task.riderId}
            title={fr ? "Assigner un livreur" : "Assign rider"}
            subtitle={`${parcelCode(task)} · ${task.orderReference} · ${pickL(LEG_KIND[task.kind], fr)}`}
            onClose={() => setAssignOpen(false)}
            onConfirm={async (rider) => {
              const res = await deskActions.assign(task.id, rider.id);
              toast(fr ? `${rider.name} assigné à ${parcelCode(task)}` : `${rider.name} assigned to ${parcelCode(task)}`);
              onChanged?.({ task: res });
            }}
          />
        </>
      )}
      {operatorHint && (
        <span className="text-xs text-slate-400" title={fr ? "Seuls les superviseurs et les responsables assignent les livreurs." : "Only supervisors and managers assign riders."}>
          {fr ? "Assignation : superviseur ou responsable" : "Assigning: supervisor or manager"}
        </span>
      )}
    </div>
  );
}
