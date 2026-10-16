"use client";

import { useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import {
  EXCEPTION_TYPE,
  SEVERITY,
  errorMessage,
  pick,
  type ExceptionRow,
} from "@/lib/warehouse-live";

/**
 * Raise a real incident: `exceptions:create {taskId?, orderReference?, type,
 * severity, hub?, notes}`. Nothing is reported as created until the server
 * acknowledges; server errors are shown inline and the form stays open.
 */
export function ExceptionForm({
  taskId,
  orderReference,
  onCreated,
  onCancel,
}: {
  taskId?: string;
  orderReference?: string;
  onCreated: (exc: ExceptionRow) => void;
  onCancel?: () => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [type, setType] = useState<string>("damaged");
  const [severity, setSeverity] = useState<string>("medium");
  const [orderRef, setOrderRef] = useState(orderReference ?? "");
  const [hub, setHub] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!notes.trim()) {
      setError(fr ? "Décrivez le problème." : "Describe the problem.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { type, severity, notes: notes.trim() };
      if (taskId) body.taskId = taskId;
      if (orderRef.trim()) body.orderReference = orderRef.trim();
      if (hub.trim()) body.hub = hub.trim();
      const created = await socketClient.request<ExceptionRow>("exceptions:create", body);
      toast(fr ? `Incident ${created.reference} créé` : `Incident ${created.reference} created`);
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          {fr ? "Type" : "Type"}
          <select className="input-premium mt-1 w-full px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(EXCEPTION_TYPE).map(([v, l]) => (
              <option key={v} value={v}>{pick(l, fr)}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {fr ? "Gravité" : "Severity"}
          <select className="input-premium mt-1 w-full px-3 py-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {Object.entries(SEVERITY).map(([v, l]) => (
              <option key={v} value={v}>{pick(l, fr)}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {fr ? "Référence de commande" : "Order reference"}
          <input
            className="input-premium mt-1 w-full px-3 py-2 text-sm"
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            readOnly={!!orderReference}
            placeholder="ORD-…"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {fr ? "Hub (facultatif)" : "Hub (optional)"}
          <input className="input-premium mt-1 w-full px-3 py-2 text-sm" value={hub} onChange={(e) => setHub(e.target.value)} />
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-600">
        {fr ? "Notes" : "Notes"}
        <textarea
          className="input-premium mt-1 w-full px-3 py-2 text-sm"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={fr ? "Que s'est-il passé ?" : "What happened?"}
        />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
          {busy ? (fr ? "Création…" : "Creating…") : (fr ? "Créer l'incident" : "Create incident")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            {fr ? "Annuler" : "Cancel"}
          </button>
        )}
      </div>
    </form>
  );
}
