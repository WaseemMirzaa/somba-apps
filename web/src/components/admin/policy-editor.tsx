"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { POLICY_FIELD_LABEL, POLICY_KEYS, POLICY_MAX, POLICY_MIN, policyPatch, policyTextInvalid, type PolicyKey, type PolicyRevision } from "@/lib/store-policy";

/**
 * Edit and publish a store's policy (`sellers:policy:publish`): the text goes live at once and is recorded as an approved
 * revision by this admin. `revision` = the pending proposal the admin is editing (it becomes approved); without one, `live`
 * is what the store shows now and the admin writes the change from there. Only the fields that differ from the live text are sent.
 */
export function PolicyEditor({
  open,
  sellerId,
  storeName,
  live,
  revision,
  onClose,
  onDone,
}: {
  open: boolean;
  sellerId: string;
  storeName: string;
  live: Record<PolicyKey, string>;
  revision?: PolicyRevision | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<PolicyKey, string>>(live);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveKey = POLICY_KEYS.map((k) => live[k]).join("\u0001");
  const revKey = revision ? `${revision.id}:${POLICY_KEYS.map((k) => revision[k] ?? "\u0000").join("\u0001")}` : "";
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- start from the proposal (or the live text) each time the editor opens */
    const start = { ...live };
    if (revision) for (const k of POLICY_KEYS) if (revision[k] !== null && revision[k] !== undefined) start[k] = revision[k] as string;
    setDraft(start);
    setNote("");
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, liveKey, revKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = policyPatch(draft, live);
  const changed = Object.keys(patch);
  const invalid = POLICY_KEYS.some((k) => policyTextInvalid(draft[k]));

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await socketClient.request("sellers:policy:publish", { sellerId, ...patch, ...(revision ? { revisionId: revision.id } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      toast(fr ? "Politique publiée sur la boutique" : "Policy published on the store", "success");
      onDone();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={fr ? `Modifier et publier : ${storeName}` : `Edit and publish: ${storeName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{fr ? "Annuler" : "Cancel"}</Button>
          <Button onClick={() => void publish()} disabled={busy || invalid || changed.length === 0}>{busy ? "…" : fr ? "Publier maintenant" : "Publish now"}</Button>
        </>
      }
    >
      <p className="text-slate-500">
        {fr
          ? "Le texte sera en ligne tout de suite et le vendeur en sera informé. Rédigez une seule langue : l'autre est traduite automatiquement."
          : "The text goes live at once and the seller is told. Write one language: the other is translated automatically."}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {POLICY_KEYS.map((k) => (
          <div key={k}>
            <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
              <span>{POLICY_FIELD_LABEL[k][fr ? "fr" : "en"]}</span>
              <span className={policyTextInvalid(draft[k]) ? "text-red-600" : "text-slate-400"}>{draft[k].trim().length}/{POLICY_MAX}</span>
            </label>
            <textarea
              className="input-premium w-full px-3 py-2 text-sm"
              rows={6}
              maxLength={POLICY_MAX}
              value={draft[k]}
              aria-label={POLICY_FIELD_LABEL[k][fr ? "fr" : "en"]}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            />
            {policyTextInvalid(draft[k]) && <p className="mt-1 text-xs text-red-600">{fr ? `${POLICY_MIN} à ${POLICY_MAX} caractères, ou laissez vide.` : `${POLICY_MIN} to ${POLICY_MAX} characters, or leave empty.`}</p>}
          </div>
        ))}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Note pour le vendeur (facultatif)" : "Note for the seller (optional)"}</label>
        <input className="input-premium w-full px-3 py-2 text-sm" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ErrorNote message={error} />
    </Modal>
  );
}
