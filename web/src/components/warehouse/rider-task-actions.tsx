"use client";

import { useState } from "react";
import { CheckCircle, Hand, PackageCheck, Truck, XCircle } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errorMessage } from "@/lib/warehouse-live";
import { formatCurrency } from "@/lib/utils";
import type { RiderTask } from "@/lib/rider";

export const FAIL_REASONS = [
  { value: "Customer unavailable", fr: "Client indisponible" },
  { value: "Customer not reachable", fr: "Client injoignable" },
  { value: "Wrong address", fr: "Mauvaise adresse" },
  { value: "Refused delivery", fr: "Livraison refusée" },
  { value: "Payment issue", fr: "Problème de paiement" },
  { value: "Parcel damaged or missing", fr: "Colis endommagé ou manquant" },
  { value: "Other", fr: "Autre" },
];

/** Run one rider action and report the real outcome. Resolves true only after the server acknowledged. */
function useRun() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, success: string): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    setError(null);
    try {
      await fn();
      toast(success);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, setError, run };
}

export function DeliveredForm({ task, onDone }: { task: RiderTask; onDone: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { busy, error, setError, run } = useRun();
  const [code, setCode] = useState("");
  const [cash, setCash] = useState(false);
  const cod = task.codAmount > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cod && !cash) {
      setError(fr ? "Confirmez d'abord l'encaissement des espèces." : "Confirm the cash was collected first.");
      return;
    }
    const ok = await run(
      "delivered",
      () => socketClient.request("delivery:updateStatus", { taskId: task.id, status: "delivered", code: code.trim() }),
      fr ? "Livraison confirmée" : "Delivery confirmed",
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs font-medium text-slate-600">
        {fr ? "Code à 4 chiffres du client" : "Customer's 4-digit code"}
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          className="input-premium mt-1 w-full px-4 py-3 text-center text-lg tracking-[0.4em]"
          placeholder="••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
        />
        <span className="mt-1 block text-[11px] text-slate-400">
          {fr ? "Le client le voit dans son application. Laissez vide si le serveur n'exige pas de code." : "The customer sees it in their app. Leave empty if the server does not require a code."}
        </span>
      </label>
      {cod && (
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={cash} onChange={(e) => setCash(e.target.checked)} />
          <span>
            {fr ? "Espèces encaissées ?" : "Cash collected?"}{" "}
            <strong>{formatCurrency(task.codAmount, locale)}</strong>{" "}
            {fr ? "ont été reçus du client." : "was received from the customer."}
          </span>
        </label>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        <CheckCircle className="h-4 w-4" />
        {busy ? "…" : (fr ? "Confirmer la livraison" : "Confirm delivered")}
      </button>
    </form>
  );
}

export function FailedForm({ task, onDone }: { task: RiderTask; onDone: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { busy, error, run } = useRun();
  const [reason, setReason] = useState(FAIL_REASONS[0].value);
  const [notes, setNotes] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = `${reason}${notes.trim() ? `: ${notes.trim()}` : ""}`.slice(0, 200);
    const ok = await run(
      "failed",
      () => socketClient.request("delivery:updateStatus", { taskId: task.id, status: "failed", reason: text }),
      fr ? "Échec enregistré" : "Failed attempt recorded",
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <select className="input-premium w-full px-4 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} aria-label={fr ? "Motif" : "Reason"}>
        {FAIL_REASONS.map((r) => (
          <option key={r.value} value={r.value}>{fr ? r.fr : r.value}</option>
        ))}
      </select>
      <textarea
        className="input-premium w-full px-4 py-2 text-sm"
        rows={3}
        maxLength={150}
        placeholder={fr ? "Notes (facultatif)" : "Notes (optional)"}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <p className="text-[11px] text-slate-400">
        {fr
          ? "Une nouvelle tentative sera créée automatiquement ; après 3 échecs la commande est annulée et remboursée."
          : "A new attempt is created automatically; after 3 failed attempts the order is cancelled and refunded."}
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        <XCircle className="h-4 w-4" />
        {busy ? "…" : (fr ? "Signaler l'échec" : "Report could not deliver")}
      </button>
    </form>
  );
}

/** The next real action(s) for a task, mirroring the mobile app: Accept → Picked up → On my way → Delivered. */
export function TaskActions({ task, onChanged }: { task: RiderTask; onChanged: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { busy, error, run } = useRun();
  const [panel, setPanel] = useState<"delivered" | "failed" | null>(null);

  if (task.status === "delivered" || task.status === "failed") {
    return null;
  }

  async function step(key: string, status: "picked_up" | "in_transit", success: string) {
    const ok = await run(key, () => socketClient.request("delivery:updateStatus", { taskId: task.id, status }), success);
    if (ok) onChanged();
  }

  async function accept() {
    const ok = await run("accept", () => socketClient.request("delivery:accept", { taskId: task.id }), fr ? "Livraison acceptée" : "Delivery accepted");
    if (ok) onChanged();
  }

  return (
    <div className="space-y-3">
      {task.status === "available" && (
        <button
          onClick={() => void accept()}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Hand className="h-4 w-4" />
          {busy === "accept" ? "…" : (fr ? "Accepter cette livraison" : "Accept this delivery")}
        </button>
      )}
      {task.status === "assigned" && (
        <button
          onClick={() => void step("picked_up", "picked_up", fr ? "Marqué collecté" : "Marked as picked up")}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <PackageCheck className="h-4 w-4" />
          {busy === "picked_up" ? "…" : (fr ? "Colis collecté" : "Picked up")}
        </button>
      )}
      {task.status === "picked_up" && (
        <button
          onClick={() => void step("in_transit", "in_transit", fr ? "En route vers le client" : "On the way to the customer")}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Truck className="h-4 w-4" />
          {busy === "in_transit" ? "…" : (fr ? "Je suis en route" : "On my way")}
        </button>
      )}
      {task.status === "in_transit" && panel !== "delivered" && (
        <button
          onClick={() => setPanel("delivered")}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <CheckCircle className="h-4 w-4" />
          {fr ? "Livré" : "Delivered"}
        </button>
      )}
      {panel === "delivered" && task.status === "in_transit" && (
        <div className="rounded-xl border border-emerald-200 p-4">
          <DeliveredForm task={task} onDone={onChanged} />
        </div>
      )}

      {task.status !== "available" && panel !== "failed" && (
        <button
          onClick={() => setPanel("failed")}
          className="w-full rounded-xl border border-red-200 py-2 text-center text-sm text-red-600 hover:bg-red-50"
        >
          {fr ? "Impossible de livrer" : "Could not deliver"}
        </button>
      )}
      {panel === "failed" && task.status !== "available" && (
        <div className="rounded-xl border border-red-200 p-4">
          <FailedForm task={task} onDone={onChanged} />
        </div>
      )}
      {error && !panel && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
