"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";
import type { Lane } from "@/lib/logistics";
import { socketClient } from "@/lib/realtime/socket-client";

interface HubOption {
  id: string;
  name: string;
  active: boolean;
}

type Errors = Partial<Record<"from" | "to" | "hours" | "cost", string>>;

/** Create (no `lane`) or edit a lane between two warehouses (`lanes:upsert`); a two-way lane saves both directions. */
export function LaneFormModal({ open, lane, hubs, fr, onClose, onSaved }: { open: boolean; lane: Lane | null; hubs: HubOption[]; fr: boolean; onClose: () => void; onSaved: () => void }) {
  return open ? <Body lane={lane} hubs={hubs} fr={fr} onClose={onClose} onSaved={onSaved} /> : null;
}

function Body({ lane, hubs, fr, onClose, onSaved }: { lane: Lane | null; hubs: HubOption[]; fr: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [from, setFrom] = useState(lane?.fromHubId ?? "");
  const [to, setTo] = useState(lane?.toHubId ?? "");
  const [hours, setHours] = useState(lane ? String(lane.transitHours) : "");
  const [cost, setCost] = useState(lane?.costUsd != null ? String(lane.costUsd) : "");
  const [bidirectional, setBidirectional] = useState(lane?.bidirectional ?? true);
  const [active, setActive] = useState(lane?.active ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (!from) e.from = fr ? "Choisissez l'entrepôt de départ." : "Choose the starting warehouse.";
    if (!to) e.to = fr ? "Choisissez l'entrepôt d'arrivée." : "Choose the destination warehouse.";
    else if (to === from) e.to = fr ? "Choisissez deux entrepôts différents." : "Choose two different warehouses.";
    const h = Number(hours.replace(",", "."));
    if (!hours.trim() || !Number.isFinite(h) || h <= 0 || h > 720) e.hours = fr ? "Durée de transit : de 0,1 à 720 heures." : "Transit time: 0.1 to 720 hours.";
    if (cost.trim()) {
      const c = Number(cost.replace(",", "."));
      if (!Number.isFinite(c) || c < 0 || c > 500) e.cost = fr ? "Coût : de 0 à 500 USD, ou laissez vide." : "Cost: 0 to 500 USD, or leave empty.";
    }
    return e;
  }

  async function submit() {
    const v = validate();
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length) return;
    setSaving(true);
    try {
      await socketClient.request<Lane>("lanes:upsert", {
        ...(lane ? { id: lane.id } : {}),
        fromHubId: from,
        toHubId: to,
        transitHours: Number(hours.replace(",", ".")),
        costUsd: cost.trim() ? Number(cost.replace(",", ".")) : null,
        active,
        bidirectional,
      });
      toast(lane ? (fr ? "Liaison mise à jour" : "Lane updated") : fr ? "Liaison créée" : "Lane created", "success");
      onSaved();
      onClose();
    } catch (e) {
      setServerError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  }

  const select = (label: string, value: string, set: (v: string) => void, error: string | undefined, testId: string) => (
    <label className="block text-xs font-medium text-slate-500">
      {label}
      <select className="input-premium mt-1 w-full px-3 py-2 text-sm text-slate-900" value={value} onChange={(e) => set(e.target.value)} aria-invalid={!!error} data-testid={testId}>
        <option value="">{fr ? "Choisir…" : "Select…"}</option>
        {hubs.map((h) => (
          <option key={h.id} value={h.id}>{h.name}{h.active ? "" : fr ? " (inactif)" : " (inactive)"}</option>
        ))}
      </select>
      {error && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{error}</span>}
    </label>
  );

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={lane ? (fr ? "Modifier la liaison" : "Edit lane") : fr ? "Nouvelle liaison" : "New lane"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>{fr ? "Annuler" : "Cancel"}</Button>
          <Button size="sm" onClick={() => void submit()} disabled={saving} data-testid="lane-save">{saving ? "…" : fr ? "Enregistrer" : "Save"}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {select(fr ? "De l'entrepôt" : "From warehouse", from, setFrom, errors.from, "lane-from")}
        {select(fr ? "Vers l'entrepôt" : "To warehouse", to, setTo, errors.to, "lane-to")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-500">
          {fr ? "Temps de transit (heures)" : "Transit time (hours)"}
          <input className="input-premium mt-1 w-full px-3 py-2 text-sm text-slate-900" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} aria-invalid={!!errors.hours} data-testid="lane-hours" />
          {errors.hours && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{errors.hours}</span>}
        </label>
        <label className="block text-xs font-medium text-slate-500">
          {fr ? "Coût du transfert (USD, facultatif)" : "Transfer cost (USD, optional)"}
          <input className="input-premium mt-1 w-full px-3 py-2 text-sm text-slate-900" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} aria-invalid={!!errors.cost} data-testid="lane-cost" />
          <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{fr ? "Vide = frais de transfert par défaut." : "Empty = the default transfer fee."}</span>
          {errors.cost && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{errors.cost}</span>}
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={bidirectional} onChange={(e) => setBidirectional(e.target.checked)} data-testid="lane-bidirectional" />
        {fr ? "Dans les deux sens (même durée et même coût)" : "Both directions (same time and cost)"}
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} data-testid="lane-active" />
        {fr ? "Active (utilisée pour calculer les itinéraires)" : "Active (used to compute routes)"}
      </label>
      <ErrorNote message={serverError} />
    </Modal>
  );
}
