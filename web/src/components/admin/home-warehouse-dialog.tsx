"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { useToast } from "@/context/toast-context";
import { errMsg, type StaffRow, type ZoneSetting } from "@/lib/admin-live";
import type { HubRow } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";

function parseZones(raw: string | undefined): ZoneSetting[] {
  try {
    const v = raw ? (JSON.parse(raw) as ZoneSetting[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Set where a rider or warehouse employee works (`roles:setHub`): their home warehouse and, for riders, the zones
 * they prefer. Riders only see and are told about their warehouse's deliveries; preferred zones are listed first.
 * Saving signs the person's open sessions out so they come back with the new warehouse.
 */
interface DialogProps {
  user: StaffRow | null;
  hubs: HubRow[];
  fr: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function HomeWarehouseDialog(props: DialogProps) {
  // Keyed by person so the form starts from their saved values each time it opens.
  return props.user ? <HomeWarehouseForm key={props.user.id} {...props} user={props.user} /> : null;
}

function HomeWarehouseForm({ user, hubs, fr, onClose, onSaved }: DialogProps & { user: StaffRow }) {
  const { toast } = useToast();
  const [hubId, setHubId] = useState(user.hubId ?? "");
  const [preferred, setPreferred] = useState<string[]>(user.preferredZones ?? []);
  const [zones, setZones] = useState<ZoneSetting[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRider = user.role === "rider";

  useEffect(() => {
    let live = true;
    socketClient
      .request<Record<string, string>>("settings:get")
      .then((all) => live && setZones(parseZones(all.deliveryZones)))
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
    };
  }, []);

  // A rider can only prefer zones their warehouse serves (or any zone while not tied to a warehouse).
  const choosable = useMemo(() => zones.filter((z) => !hubId || !z.hubId || z.hubId === hubId), [zones, hubId]);

  function pickHub(id: string) {
    setHubId(id);
    setPreferred((p) => p.filter((zid) => zones.some((z) => z.id === zid && (!id || !z.hubId || z.hubId === id))));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await socketClient.request("roles:setHub", {
        userId: user.id,
        hubId: hubId || null,
        ...(isRider ? { preferredZones: preferred } : {}),
      });
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
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Entrepôt" : "Home warehouse"}</span>
        <select className="input-premium w-full px-3 py-2 text-sm" value={hubId} onChange={(e) => pickHub(e.target.value)}>
          <option value="">{fr ? "Aucun — voit tous les entrepôts" : "None — sees every warehouse"}</option>
          {hubs.filter((h) => h.active || h.id === hubId).map((h) => (
            <option key={h.id} value={h.id}>{h.name} · {h.city}</option>
          ))}
        </select>
      </label>
      {isRider && (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Zones préférées" : "Preferred zones"}</legend>
          {choosable.length === 0 ? (
            <p className="text-xs text-slate-400">{fr ? "Cet entrepôt ne dessert encore aucune zone (page Zones)." : "This warehouse serves no zones yet (Zones page)."}</p>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {choosable.map((z) => (
                <label key={z.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={preferred.includes(z.id)}
                    onChange={(e) => setPreferred((p) => (e.target.checked ? [...p, z.id] : p.filter((x) => x !== z.id)))}
                  />
                  <span>{fr ? z.nameFr || z.name : z.name}</span>
                  <span className="text-xs text-slate-400">{z.city}</span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">{fr ? "Les livraisons de ces zones apparaissent en premier pour ce livreur." : "Deliveries in these zones are listed first for this rider."}</p>
        </fieldset>
      )}
      <p className="text-xs text-slate-500">
        {fr
          ? "Enregistrer déconnecte la personne ; à sa reconnexion elle voit les colis de son entrepôt."
          : "Saving signs the person out; when they sign back in they see their warehouse's parcels."}
      </p>
      <ErrorNote message={error} />
    </Modal>
  );
}
