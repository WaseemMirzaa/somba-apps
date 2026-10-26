"use client";

import { useState } from "react";
import { ArrowRight, Bike, CheckCheck, Link2, PackageCheck, PackageMinus, PackagePlus, Scissors, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { ScanInput } from "@/components/warehouse/scan-input";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { fmtDateTime, legItemsText, type Run, type RunProposal } from "@/lib/logistics";
import { parcelCode, shortId, type DeskTask } from "@/lib/warehouse";
import { runActions, runStatusLabel, runStatusVariant } from "@/lib/warehouse-runs";
import { errorMessage } from "@/lib/warehouse-live";

/** One parcel in a run: its code, order, cargo; the desk may know more than the run's taskIds say. */
function ParcelLine({ id, task, fr, trailing }: { id: string; task?: DeskTask; fr: boolean; trailing?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm" data-testid="run-parcel" data-task-id={id}>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{task ? parcelCode(task) : `PKG-${shortId(id)}`}</span>
      {task && <span className="font-medium text-slate-800">{task.orderReference}</span>}
      {task && <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{legItemsText(task.items, fr)}</span>}
      {trailing}
    </li>
  );
}

/**
 * A transfer run (UC-11). Leaving: add or remove parcels while it is planned, choose the driver, dispatch (every
 * parcel is scanned out at once). Arriving: receive every parcel at once, scan them one by one, then close (parcels
 * not received become exceptions on the server).
 */
export function RunCard({
  run,
  direction,
  tasks,
  proposals,
  siblings = [],
  canAssign,
  onChanged,
}: {
  run: Run;
  direction: "out" | "in";
  tasks: Map<string, DeskTask>;
  /** Parcels waiting for the same next warehouse (they can be added while the run is planned). */
  proposals?: RunProposal[];
  /** The other open runs on the same lane (one driver per run: several drivers = several runs). */
  siblings?: Run[];
  canAssign: boolean;
  onChanged: () => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPick, setAddPick] = useState<Set<string>>(new Set());
  const [closeOpen, setCloseOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitPick, setSplitPick] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const ids = run.taskIds ?? [];
  const taskOf = (id: string) => tasks.get(id) ?? run.tasks?.find((t) => t.id === id);
  const planned = run.status === "planned";
  const incoming = direction === "in";
  const canReceive = incoming && (run.status === "dispatched" || run.status === "arrived");
  const addable = (proposals ?? []).filter((p) => p.toHubId === run.toHubId).flatMap((p) => p.taskIds).filter((id) => !ids.includes(id));
  const waiting = ids.length - run.receivedCount - run.missingCount;
  // Where this run sits in a multi-hop route (read from its parcels); each hop is its own run with its own driver.
  const hopTask = ids.map((id) => taskOf(id)).find((t) => t?.hops && t.hops > 1);
  const hopText = hopTask?.hop && hopTask.hops ? (fr ? `Étape ${hopTask.hop}/${hopTask.hops}` : `Hop ${hopTask.hop}/${hopTask.hops}`) : null;

  async function act(name: string, fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(name);
    setError(null);
    try {
      await fn();
      toast(done, "success");
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const togglePick = (set: Set<string>, id: string, write: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(next);
  };

  return (
    <div className="card-premium p-4" data-testid="run-card" data-run={run.reference}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-slate-900">{run.reference}</span>
            <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run, fr)}</Badge>
            <Badge variant="default">{ids.length} {fr ? "colis" : ids.length === 1 ? "parcel" : "parcels"}</Badge>
            {hopText && <Badge variant="purple" >{hopText}</Badge>}
          </div>
          <p className="inline-flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700">
            <Truck className="h-4 w-4 text-slate-400" />
            {run.fromHubName}
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            {run.toHubName}
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Bike className="h-3.5 w-3.5" />
              {fr ? "Chauffeur de cette étape : " : "Driver of this hop: "}
              <strong className="font-medium text-slate-700" data-testid="run-driver">{run.riderName ?? (fr ? "pas encore choisi" : "not chosen yet")}</strong>
            </span>
            {run.dispatchedAt && <span>{fr ? "Départ" : "Left"}: {fmtDateTime(run.dispatchedAt, fr)}</span>}
            {run.arrivedAt && <span>{fr ? "Arrivée" : "Arrived"}: {fmtDateTime(run.arrivedAt, fr)}</span>}
            {(run.status !== "planned") && (
              <span data-testid="run-counts">
                {fr ? "Reçus" : "Received"} {run.receivedCount}/{ids.length}
                {run.missingCount > 0 ? <strong className="text-red-600"> · {fr ? "manquants" : "missing"} {run.missingCount}</strong> : null}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!incoming && planned && canAssign && (
            <>
              <Button size="sm" variant="secondary" onClick={() => { setAddPick(new Set()); setAddOpen(true); }} disabled={addable.length === 0} data-testid="run-add" title={addable.length === 0 ? (fr ? "Aucun autre colis n'attend cet entrepôt" : "No other parcel is waiting for this warehouse") : undefined}>
                <PackagePlus className="h-3.5 w-3.5" />{fr ? "Ajouter des colis" : "Add parcels"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setSplitPick(new Set()); setSplitOpen(true); }} disabled={ids.length < 2} data-testid="run-split" title={ids.length < 2 ? (fr ? "Il faut au moins deux colis pour scinder" : "A run needs at least two parcels to split") : undefined}>
                <Scissors className="h-3.5 w-3.5" />{fr ? "Scinder la tournée" : "Split run"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)} data-testid="run-assign">
                <Bike className="h-3.5 w-3.5" />{run.riderName ? (fr ? "Changer de chauffeur" : "Change driver") : fr ? "Assigner un chauffeur" : "Assign driver"}
              </Button>
              <Button size="sm" onClick={() => void act("dispatch", () => runActions.dispatch(run.id), fr ? `Tournée ${run.reference} partie : ${ids.length} colis remis au chauffeur` : `Run ${run.reference} left: ${ids.length} parcels handed to the driver`)} disabled={!!busy || ids.length === 0} data-testid="run-dispatch">
                <PackageCheck className="h-3.5 w-3.5" />{busy === "dispatch" ? "…" : fr ? "Faire partir la tournée" : "Dispatch run"}
              </Button>
            </>
          )}
          {canReceive && (
            <>
              <Button size="sm" onClick={() => void act("receive", () => runActions.receive(run.id), fr ? `Tournée ${run.reference} : tous les colis reçus` : `Run ${run.reference}: every parcel received`)} disabled={!!busy || waiting <= 0} data-testid="run-receive-all">
                <CheckCheck className="h-3.5 w-3.5" />{busy === "receive" ? "…" : fr ? "Tout recevoir" : "Receive all"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCloseOpen(true)} disabled={!!busy} data-testid="run-close">
                {fr ? "Clôturer" : "Close run"}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <div className="mt-3"><ErrorNote message={error} /></div>}

      {siblings.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500" data-testid="run-siblings">
          <Link2 className="h-3.5 w-3.5" />
          {fr ? "Autres tournées sur la même liaison :" : "Other runs on the same lane:"}
          {siblings.map((s) => (
            <span key={s.id} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
              {s.reference} · {s.taskIds.length} {fr ? "colis" : s.taskIds.length === 1 ? "parcel" : "parcels"} · {s.riderName ?? (fr ? "sans chauffeur" : "no driver")}
            </span>
          ))}
        </p>
      )}
      {!incoming && planned && (
        <p className="mt-2 text-[11px] text-slate-400">
          {fr
            ? "Un chauffeur par tournée. Si les colis ne tiennent pas dans un seul véhicule, scindez la tournée : chaque tournée a son chauffeur. Chaque étape d'un itinéraire a sa propre tournée et son propre chauffeur."
            : "One driver per run. If the parcels do not fit one vehicle, split the run: each run gets its own driver. Each hop of a route has its own run and its own driver."}
        </p>
      )}

      {canReceive && (
        <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-xs font-medium text-slate-600">{fr ? "Scanner colis par colis" : "Scan parcel by parcel"}</p>
          <ScanInput
            legs={ids.map((id) => taskOf(id)).filter((t): t is DeskTask => !!t)}
            buttonLabel={fr ? "Recevoir" : "Receive"}
            onFound={async (leg) => {
              if (!ids.includes(leg.id)) {
                toast(fr ? `${parcelCode(leg)} ne fait pas partie de cette tournée.` : `${parcelCode(leg)} is not part of this run.`, "error");
                return;
              }
              await act("scan", () => runActions.receive(run.id, [leg.id]), fr ? `${parcelCode(leg)} reçu` : `${parcelCode(leg)} received`);
            }}
          />
        </div>
      )}

      {ids.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {ids.map((id) => {
            const t = taskOf(id);
            const received = t ? t.status === "delivered" : false;
            return (
              <ParcelLine
                key={id}
                id={id}
                task={t as DeskTask | undefined}
                fr={fr}
                trailing={
                  !incoming && planned && canAssign ? (
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => void act("remove", () => runActions.update(run.id, { removeTaskIds: [id] }), fr ? "Colis retiré de la tournée" : "Parcel removed from the run")} data-testid="run-remove">
                      <PackageMinus className="h-3.5 w-3.5" />{fr ? "Retirer" : "Remove"}
                    </button>
                  ) : canReceive && !received ? (
                    <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--primary)]" checked={picked.has(id)} onChange={() => togglePick(picked, id, setPicked)} aria-label={fr ? "Choisir ce colis" : "Pick this parcel"} />
                      {fr ? "Choisir" : "Pick"}
                    </label>
                  ) : received ? (
                    <Badge variant="success">{fr ? "Reçu" : "Received"}</Badge>
                  ) : null
                }
              />
            );
          })}
        </ul>
      )}
      {canReceive && picked.size > 0 && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void act("receive-some", async () => { await runActions.receive(run.id, [...picked]); setPicked(new Set()); }, fr ? `${picked.size} colis reçus` : `${picked.size} parcels received`)} data-testid="run-receive-picked">
            {fr ? `Recevoir les ${picked.size} colis choisis` : `Receive the ${picked.size} picked parcels`}
          </Button>
        </div>
      )}

      {/* Add parcels (planned runs only). */}
      <Modal
        open={addOpen}
        onClose={() => !busy && setAddOpen(false)}
        title={fr ? `Ajouter à ${run.reference}` : `Add to ${run.reference}`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" disabled={addPick.size === 0 || !!busy} onClick={() => void act("add", async () => { await runActions.update(run.id, { addTaskIds: [...addPick] }); setAddOpen(false); }, fr ? `${addPick.size} colis ajoutés` : `${addPick.size} parcels added`)} data-testid="run-add-confirm">
              {busy === "add" ? "…" : fr ? `Ajouter (${addPick.size})` : `Add (${addPick.size})`}
            </Button>
          </>
        }
      >
        <p className="text-slate-500">{fr ? `Colis qui attendent de partir vers ${run.toHubName} :` : `Parcels waiting to leave for ${run.toHubName}:`}</p>
        <ul className="divide-y divide-slate-100">
          {addable.map((id) => (
            <ParcelLine key={id} id={id} task={tasks.get(id)} fr={fr} trailing={<input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={addPick.has(id)} onChange={() => togglePick(addPick, id, setAddPick)} aria-label={fr ? "Ajouter ce colis" : "Add this parcel"} />} />
          ))}
        </ul>
      </Modal>

      {/* Split: the chosen parcels move into a new run on the same lane. */}
      <Modal
        open={splitOpen}
        onClose={() => !busy && setSplitOpen(false)}
        title={fr ? `Scinder ${run.reference}` : `Split ${run.reference}`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSplitOpen(false)} disabled={!!busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button
              size="sm"
              disabled={!!busy || splitPick.size === 0 || splitPick.size >= ids.length}
              data-testid="run-split-confirm"
              onClick={() =>
                void act(
                  "split",
                  async () => {
                    const res = await runActions.split(run.id, [...splitPick]);
                    toast(
                      fr
                        ? `${res.created.reference} créée avec ${res.created.taskIds.length} colis : assignez-lui son chauffeur`
                        : `${res.created.reference} created with ${res.created.taskIds.length} parcels: assign it its own driver`,
                      "success",
                    );
                    setSplitOpen(false);
                  },
                  fr ? `Tournée ${run.reference} scindée` : `Run ${run.reference} split`,
                )
              }
            >
              {busy === "split" ? "…" : fr ? `Déplacer ${splitPick.size} colis dans une nouvelle tournée` : `Move ${splitPick.size} parcels to a new run`}
            </Button>
          </>
        }
      >
        <p className="text-slate-500">
          {fr
            ? `Choisissez les colis qui partiront dans une autre tournée sur la même liaison (${run.fromHubName} → ${run.toHubName}). Laissez-en au moins un dans ${run.reference}.`
            : `Pick the parcels that will leave in another run on the same lane (${run.fromHubName} → ${run.toHubName}). Leave at least one in ${run.reference}.`}
        </p>
        <ul className="divide-y divide-slate-100">
          {ids.map((id) => (
            <ParcelLine key={id} id={id} task={taskOf(id) as DeskTask | undefined} fr={fr} trailing={<input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={splitPick.has(id)} onChange={() => togglePick(splitPick, id, setSplitPick)} aria-label={fr ? "Déplacer ce colis" : "Move this parcel"} />} />
          ))}
        </ul>
        {splitPick.size >= ids.length && <p className="text-xs text-red-600" role="alert">{fr ? "Laissez au moins un colis dans la tournée d'origine." : "Leave at least one parcel in the original run."}</p>}
      </Modal>

      {/* The driver may come from the sending or the receiving warehouse. */}
      <AssignRiderModal
        open={assignOpen}
        taskId={ids[0]}
        selectedRiderId={run.riderId}
        title={fr ? `Chauffeur de la tournée ${run.reference}` : `Driver for run ${run.reference}`}
        subtitle={fr ? `${run.fromHubName} → ${run.toHubName}. Le chauffeur peut venir de l'un ou l'autre entrepôt.` : `${run.fromHubName} → ${run.toHubName}. The driver may come from either warehouse.`}
        onClose={() => setAssignOpen(false)}
        onConfirm={async (rider) => {
          await runActions.assign(run.id, rider.id);
          toast(fr ? `${rider.name} conduira la tournée ${run.reference}` : `${rider.name} will drive run ${run.reference}`, "success");
          onChanged();
        }}
      />

      {/* Closing with parcels still missing raises exceptions. */}
      <Modal
        open={closeOpen}
        onClose={() => !busy && setCloseOpen(false)}
        title={fr ? `Clôturer la tournée ${run.reference} ?` : `Close run ${run.reference}?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCloseOpen(false)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant={waiting > 0 ? "danger" : "primary"} size="sm" disabled={!!busy} onClick={() => void act("close", async () => { await runActions.close(run.id); setCloseOpen(false); }, fr ? `Tournée ${run.reference} clôturée` : `Run ${run.reference} closed`)} data-testid="run-close-confirm">
              {busy === "close" ? "…" : fr ? "Clôturer" : "Close run"}
            </Button>
          </>
        }
      >
        {waiting > 0 ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700" role="alert">
            {fr
              ? `${waiting} colis ne sont pas reçus. À la clôture, chacun devient une exception « Colis manquant dans la tournée ${run.reference} », avec une alerte aux deux entrepôts et aux admins.`
              : `${waiting} parcels are not received. On closing, each becomes an exception “Parcel missing from run ${run.reference}”, with notices to both warehouses and admins.`}
          </p>
        ) : (
          <p className="text-slate-600">{fr ? "Tous les colis sont reçus : la tournée peut être clôturée." : "Every parcel is received: the run can be closed."}</p>
        )}
      </Modal>
    </div>
  );
}
