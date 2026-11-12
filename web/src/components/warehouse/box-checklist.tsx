"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import type { TaskView } from "@/lib/logistics";
import { ParcelContents } from "@/components/parcel/parcel-contents";
import { parcelErrorWithHint } from "@/lib/parcel-errors";
import { boxText, handMarkStage, reasonValid, scanCounterText, stageCounts, type BoxLine, type ScanStage } from "@/lib/parcel-scan";
import { deskActions, useHubScope } from "@/lib/warehouse";
import { errorMessage } from "@/lib/warehouse-live";

/** Confirm a hand-marked box: a reason of at least 3 characters (audited by the server); label-only buttons. */
function MarkByHandDialog({ code, stage, taskId, onDone, onClose }: { code: string; stage: ScanStage; taskId: string; onDone: (res: { task: TaskView }) => void; onClose: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!reasonValid(reason)) {
      setError(fr ? "Indiquez un motif d'au moins 3 caractères, par exemple « étiquette déchirée »." : 'Give a reason of at least 3 characters, for example "label torn".');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await deskActions.markParcel(taskId, code, stage, reason.trim());
      toast(fr ? `${code} marqué scanné à la main` : `${code} marked scanned by hand`);
      onDone(res);
      onClose();
    } catch (err) {
      const m = parcelErrorWithHint(errorMessage(err), fr);
      setError(m);
      toast(m, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={fr ? "Marquer scanné à la main" : "Mark scanned by hand"}>
      <form onSubmit={(e) => void confirm(e)} className="card-premium w-full max-w-md p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">{fr ? "Marquer ce carton scanné à la main ?" : "Mark this box scanned by hand?"}</h3>
        <p className="mt-2 text-sm text-slate-600">
          {fr
            ? `${code} sera compté comme scanné (${stage === "pickup" ? "collecte" : "remise"}). Pour une étiquette abîmée ; le motif est journalisé.`
            : `${code} will count as scanned (${stage === "pickup" ? "pickup" : "drop-off"}). For a damaged label; the reason is logged.`}
        </p>
        <label className="mt-3 block text-xs font-medium text-slate-600">
          {fr ? "Motif" : "Reason"}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            autoFocus
            className="input-premium mt-1 w-full px-3 py-2 text-sm"
            placeholder={fr ? "Étiquette déchirée" : "Label torn"}
            data-testid="hand-mark-reason"
          />
        </label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          <button type="button" onClick={onClose} disabled={busy} className="px-2 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            {fr ? "Annuler" : "Cancel"}
          </button>
          <button type="submit" disabled={busy} className="btn-primary min-h-[2.75rem] rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-60 sm:min-w-[10rem]">
            {busy ? "…" : fr ? "Marquer scanné" : "Mark scanned"}
          </button>
        </div>
      </form>
    </div>
  );
}

const Tick = ({ done }: { done: boolean }) =>
  done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />;

/**
 * The boxes of a leg for the desk: code, "Box 1/3", and when each was scanned at pickup and at drop-off, with the counter per
 * stage. Supervisors and managers get "Mark scanned by hand" on a box not yet scanned at the stage the leg is waiting for;
 * operators do not see it. Nothing is drawn for a leg without labelled boxes.
 */
export function BoxChecklist({
  task,
  onChanged,
  stage,
  compact = false,
}: {
  task: Pick<TaskView, "id" | "status" | "parcels"> & Partial<Pick<TaskView, "parcelContents" | "parcelOrders">>;
  onChanged?: (res?: { task?: TaskView }) => void;
  /** Which stage the counter and the hand-mark are about; defaults to the one the leg is waiting for. */
  stage?: ScanStage | null;
  compact?: boolean;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { canAssign } = useHubScope();
  const [marking, setMarking] = useState<string | null>(null);
  const boxes: BoxLine[] = task.parcels ?? [];
  if (boxes.length === 0) return null;
  const markStage = stage ?? handMarkStage(task.status);
  const pick = stageCounts(boxes, "pickup");
  const drop = stageCounts(boxes, "dropoff");
  return (
    <div className={compact ? "mt-1 space-y-1" : "space-y-2"} data-testid="box-checklist">
      <p className="flex flex-wrap gap-x-4 text-xs font-medium text-slate-600">
        <span data-testid="pickup-counter">{fr ? "Collecte" : "Pickup"}: {scanCounterText(pick.scanned, pick.total, fr)}</span>
        <span data-testid="dropoff-counter">{fr ? "Remise" : "Drop-off"}: {scanCounterText(drop.scanned, drop.total, fr)}</span>
      </p>
      <ul className="space-y-1">
        {boxes.map((p) => {
          const scannedHere = markStage ? !!(markStage === "pickup" ? p.pickupScannedAt : p.dropoffScannedAt) : true;
          return (
            <li key={p.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="desk-box">
              <span className="text-slate-700">{boxText(p, fr)}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{p.code}</span>
              <span className="inline-flex items-center gap-1 text-slate-500"><Tick done={!!p.pickupScannedAt} />{fr ? "collecte" : "pickup"}</span>
              <span className="inline-flex items-center gap-1 text-slate-500"><Tick done={!!p.dropoffScannedAt} />{fr ? "remise" : "drop-off"}</span>
              {canAssign && markStage && !scannedHere && (
                <button type="button" onClick={() => setMarking(p.code)} className="font-medium text-indigo-700 hover:underline" data-testid="hand-mark">
                  {fr ? "Marquer scanné à la main" : "Mark scanned by hand"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ParcelContents contents={task.parcelContents} orders={task.parcelOrders} compact={compact} />
      {marking && markStage && (
        <MarkByHandDialog
          code={marking}
          stage={markStage}
          taskId={task.id}
          onDone={(res) => onChanged?.({ task: res.task })}
          onClose={() => setMarking(null)}
        />
      )}
    </div>
  );
}
