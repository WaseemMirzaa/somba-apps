"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { useToast } from "@/context/toast-context";
import { errMsg, type StaffRow } from "@/lib/admin-live";
import type { HubRow } from "@/lib/admin-stats";
import { localizeApiError } from "@/lib/api-errors";
import { TIER_LABEL, type WarehouseTier } from "@/lib/logistics";
import { socketClient } from "@/lib/realtime/socket-client";

export const NEEDS_HUB_MESSAGE = "Riders and warehouse staff must belong to a warehouse. Pick one from the list.";

/** Hub + tier pickers shared by the create forms and the placement dialog. */
export function HubTierFields({
  hubs,
  hubId,
  onHub,
  tier,
  onTier,
  showTier,
  fr,
  error,
}: {
  hubs: HubRow[];
  hubId: string;
  onHub: (id: string) => void;
  tier: WarehouseTier;
  onTier: (t: WarehouseTier) => void;
  showTier: boolean;
  fr: boolean;
  error?: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Entrepôt (obligatoire)" : "Warehouse (required)"}</span>
        <select className="input-premium w-full px-3 py-2 text-sm" value={hubId} onChange={(e) => onHub(e.target.value)} aria-invalid={!!error}>
          <option value="">{fr ? "Choisir un entrepôt…" : "Pick a warehouse…"}</option>
          {hubs.filter((h) => h.active || h.id === hubId).map((h) => (
            <option key={h.id} value={h.id}>{h.name} · {h.city}</option>
          ))}
        </select>
        {error && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{error}</span>}
      </label>
      {showTier && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Niveau" : "Tier"}</span>
          <select className="input-premium w-full px-3 py-2 text-sm" value={tier} onChange={(e) => onTier(e.target.value as WarehouseTier)}>
            {(["operator", "supervisor", "manager"] as WarehouseTier[]).map((t) => (
              <option key={t} value={t}>{fr ? TIER_LABEL[t].fr : TIER_LABEL[t].en}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-400">
            {fr ? "Opérateur : scanne. Superviseur : assigne aussi les livreurs. Responsable : gère aussi l'entrepôt." : "Operator scans. Supervisor also assigns riders. Manager also runs the warehouse."}
          </span>
        </label>
      )}
    </div>
  );
}

/** The literal "pick a warehouse" sentence in the viewer's language (same text the server answers with). */
export const needsHubText = (fr: boolean) => localizeApiError(NEEDS_HUB_MESSAGE, fr ? "fr" : "en");

interface DialogProps {
  user: StaffRow | null;
  hubs: HubRow[];
  fr: boolean;
  /** Turning the person into a rider / warehouse employee: the new role is saved together with the warehouse. */
  nextRole?: "rider" | "warehouse_staff";
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Where a rider or warehouse employee works, and (employees) their tier.
 * `roles:setHub` for the warehouse, `hubs:setTier` for the tier, `roles:setRole {id, role, hubId}` when changing role.
 * Saving signs the person's open sessions out so they come back with the new warehouse.
 */
export function HomeWarehouseDialog(props: DialogProps) {
  // Keyed by person so the form starts from their saved values each time it opens.
  return props.user ? <HomeWarehouseForm key={`${props.user.id}:${props.nextRole ?? ""}`} {...props} user={props.user} /> : null;
}

function HomeWarehouseForm({ user, hubs, fr, nextRole, onClose, onSaved }: DialogProps & { user: StaffRow }) {
  const { toast } = useToast();
  const [hubId, setHubId] = useState(user.hubId ?? "");
  const [tier, setTier] = useState<WarehouseTier>((user.warehouseTier as WarehouseTier | null) ?? "operator");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const role = nextRole ?? user.role;
  const isStaff = role === "warehouse_staff";

  async function save() {
    setError(null);
    if (!hubId) {
      setHubError(needsHubText(fr));
      return;
    }
    setHubError(null);
    setSaving(true);
    try {
      if (nextRole) {
        await socketClient.request("roles:setRole", { id: user.id, role: nextRole, hubId });
      } else if (hubId !== (user.hubId ?? "")) {
        await socketClient.request("roles:setHub", { userId: user.id, hubId });
      }
      if (isStaff && (nextRole || tier !== (user.warehouseTier ?? "operator"))) {
        await socketClient.request("hubs:setTier", { userId: user.id, tier });
      }
      toast(fr ? "Entrepôt enregistré" : "Warehouse saved", "success");
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={fr ? `Lieu de travail — ${user.name}` : `Where ${user.name} works`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>{fr ? "Annuler" : "Cancel"}</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "…" : fr ? "Enregistrer" : "Save"}</Button>
        </>
      }
    >
      <HubTierFields hubs={hubs} hubId={hubId} onHub={setHubId} tier={tier} onTier={setTier} showTier={isStaff} fr={fr} error={hubError} />
      <p className="text-xs text-slate-500">
        {fr
          ? "Enregistrer déconnecte la personne ; à sa reconnexion elle voit les tâches de son entrepôt."
          : "Saving signs the person out; when they sign back in they see their warehouse's tasks."}
      </p>
      <ErrorNote message={error} />
    </Modal>
  );
}
