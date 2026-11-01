"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { AreaFields, EMPTY_AREA_FORM, areaPayload, validateAreaForm, type AreaForm, type AreaFormErrors } from "@/components/admin/area-fields";
import { CHILD_LEVELS } from "@/components/admin/area-detail";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";
import { areaName, levelLabel, type Area, type AreaLevel } from "@/lib/areas";
import { socketClient } from "@/lib/realtime/socket-client";

/** Add a commune, district or quartier under a city (or a quartier under a commune): `geo:create`. */
export function AreaCreateModal({ parent, fr, onClose, onCreated }: { parent: Area | null; fr: boolean; onClose: () => void; onCreated: (a: Area) => void }) {
  return parent ? <Body key={parent.id} parent={parent} fr={fr} onClose={onClose} onCreated={onCreated} /> : null;
}

function Body({ parent, fr, onClose, onCreated }: { parent: Area; fr: boolean; onClose: () => void; onCreated: (a: Area) => void }) {
  const { toast } = useToast();
  const levels = CHILD_LEVELS[parent.level];
  const [level, setLevel] = useState<AreaLevel>(levels.includes("commune") ? "commune" : levels[0]);
  const [form, setForm] = useState<AreaForm>(EMPTY_AREA_FORM);
  const [errors, setErrors] = useState<AreaFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const v = validateAreaForm(form, fr);
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length) return;
    setSaving(true);
    try {
      const created = await socketClient.request<Area>("geo:create", { parentId: parent.id, level, ...areaPayload(form, "create") });
      toast(fr ? `${levelLabel(level, true)} ajouté(e) : ${created.name}` : `${levelLabel(level, false)} added: ${created.nameEn || created.name}`, "success");
      onCreated(created);
      onClose();
    } catch (e) {
      setServerError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={fr ? `Ajouter sous « ${areaName(parent, true)} »` : `Add under "${areaName(parent, false)}"`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>{fr ? "Annuler" : "Cancel"}</Button>
          <Button size="sm" onClick={() => void submit()} disabled={saving} data-testid="area-create-submit">{saving ? "…" : fr ? "Ajouter" : "Add"}</Button>
        </>
      }
    >
      {levels.length > 1 && (
        <label className="block text-xs font-medium text-slate-500">
          {fr ? "Type de zone" : "Kind of area"}
          <select className="input-premium mt-1 w-full px-3 py-2 text-sm text-slate-900" value={level} onChange={(e) => setLevel(e.target.value as AreaLevel)} data-testid="area-create-level">
            {levels.map((l) => (
              <option key={l} value={l}>{levelLabel(l, fr)}</option>
            ))}
          </select>
        </label>
      )}
      <AreaFields form={form} setForm={setForm} errors={errors} fr={fr} disabled={saving} />
      <ErrorNote message={serverError} />
    </Modal>
  );
}
