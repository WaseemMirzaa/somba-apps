"use client";

import { useEffect, useState } from "react";
import { CheckCircle, PackageCheck, Truck, Warehouse, XCircle } from "lucide-react";
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
  { value: "Seller not ready", fr: "Vendeur pas prêt" },
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

/** What the buttons say, by what the leg is. */
function labels(task: RiderTask, fr: boolean) {
  const from = task.fromName;
  const to = task.toName;
  switch (task.kind) {
    case "pickup":
      return {
        picked: fr ? `Colis récupéré chez ${from}` : `Picked up from ${from}`,
        pickedToast: fr ? "Marqué collecté" : "Marked as picked up",
        go: fr ? `Je pars vers ${to}` : `On my way to ${to}`,
        goToast: fr ? "En route vers l'entrepôt" : "On the way to the warehouse",
      };
    case "transfer":
    case "return_transfer":
      return {
        picked: fr ? `Colis pris à ${from}` : `Picked up at ${from}`,
        pickedToast: fr ? "Marqué collecté" : "Marked as picked up",
        go: fr ? `Je pars vers ${to}` : `On my way to ${to}`,
        goToast: fr ? "En route vers l'autre entrepôt" : "On the way to the other warehouse",
      };
    case "return_pickup":
      return {
        picked: fr ? "Colis repris chez le client" : "Collected from the customer",
        pickedToast: fr ? "Retour collecté" : "Return collected",
        go: fr ? `Je pars vers ${to}` : `On my way to ${to}`,
        goToast: fr ? "En route vers l'entrepôt" : "On the way to the warehouse",
      };
    default:
      return {
        picked: fr ? `Colis pris à ${from}` : `Picked up at ${from}`,
        pickedToast: fr ? "Marqué collecté" : "Marked as picked up",
        go: fr ? "Je suis en route" : "On my way",
        goToast: fr ? "En route" : "On the way",
      };
  }
}

export function DeliveredForm({ task, onDone }: { task: RiderTask; onDone: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { busy, error, setError, run } = useRun();
  const [code, setCode] = useState("");
  const [cash, setCash] = useState(false);
  const cod = task.codAmount > 0;
  // The API flags every customer delivery `needsCode`; the code is only enforced when the platform setting is on.
  const [requireCode, setRequireCode] = useState(false);
  useEffect(() => {
    let alive = true;
    socketClient
      .request<Record<string, string>>("settings:get")
      .then((all) => alive && setRequireCode(all.requireDeliveryCode === "true"))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const needsCode = task.needsCode && requireCode;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsCode && !code.trim()) {
      setError(fr ? "Demandez le code à 4 chiffres au client." : "Ask the customer for their 4-digit code.");
      return;
    }
    if (cod && !cash) {
      setError(fr ? "Confirmez d'abord l'encaissement des espèces." : "Confirm the cash was collected first.");
      return;
    }
    const ok = await run(
      "delivered",
      () => socketClient.request("delivery:updateStatus", { taskId: task.id, status: "delivered", ...(needsCode ? { code: code.trim() } : {}) }),
      fr ? "Livraison confirmée" : "Delivery confirmed",
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {needsCode && (
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
          <span className="mt-1 block text-[11px] text-slate-400">{fr ? "Le client le voit dans son application." : "The customer sees it in their app."}</span>
        </label>
      )}
      {cod && (
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={cash} onChange={(e) => setCash(e.target.checked)} />
          <span>
            {fr ? "Espèces encaissées ?" : "Cash collected?"} <strong>{formatCurrency(task.codAmount, locale)}</strong>{" "}
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
        {busy ? "…" : task.kind === "return_to_seller" ? (fr ? "Confirmer la remise au vendeur" : "Confirm handed to the seller") : fr ? "Confirmer la livraison" : "Confirm delivered"}
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
          ? "Un nouveau trajet est créé automatiquement ; après 3 échecs d'une collecte ou d'une livraison, la commande est annulée et remboursée."
          : "A new leg is created automatically; after 3 failed attempts of a pickup or a delivery the order is cancelled and refunded."}
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        <XCircle className="h-4 w-4" />
        {busy ? "…" : fr ? "Signaler l'échec" : "Report could not complete"}
      </button>
    </form>
  );
}

/**
 * The next real action(s) for a leg: Picked up → On my way → Delivered (customer / seller legs) or → hand over to the
 * warehouse (legs that end at a warehouse: the staff scan the parcel in, the rider never presses "delivered" there).
 */
export function TaskActions({ task, onChanged }: { task: RiderTask; onChanged: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { busy, error, run } = useRun();
  const [panel, setPanel] = useState<"delivered" | "failed" | null>(null);
  const l = labels(task, fr);

  if (task.status === "delivered" || task.status === "failed") return null;

  async function step(key: string, status: "picked_up" | "in_transit", success: string) {
    const ok = await run(key, () => socketClient.request("delivery:updateStatus", { taskId: task.id, status }), success);
    if (ok) onChanged();
  }

  const primary = "flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60";

  return (
    <div className="space-y-3">
      {task.status === "assigned" && (
        <button onClick={() => void step("picked_up", "picked_up", l.pickedToast)} disabled={busy !== null} className={primary}>
          <PackageCheck className="h-4 w-4" />
          {busy === "picked_up" ? "…" : l.picked}
        </button>
      )}
      {task.status === "picked_up" && (
        <button onClick={() => void step("in_transit", "in_transit", l.goToast)} disabled={busy !== null} className={primary}>
          <Truck className="h-4 w-4" />
          {busy === "in_transit" ? "…" : l.go}
        </button>
      )}
      {task.status === "in_transit" && task.hubBound && (
        <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          <Warehouse className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            {fr
              ? `Remettez le colis au personnel de ${task.toName} : ils le scannent à l'arrivée et terminent ce trajet.`
              : `Hand the parcel to the staff at ${task.toName}: they scan it in and finish this leg.`}
          </p>
        </div>
      )}
      {task.status === "in_transit" && !task.hubBound && panel !== "delivered" && (
        <button onClick={() => setPanel("delivered")} className={primary}>
          <CheckCircle className="h-4 w-4" />
          {task.kind === "return_to_seller" ? (fr ? "Remis au vendeur" : "Handed to the seller") : fr ? "Livré" : "Delivered"}
        </button>
      )}
      {panel === "delivered" && task.status === "in_transit" && !task.hubBound && (
        <div className="rounded-xl border border-emerald-200 p-4">
          <DeliveredForm task={task} onDone={onChanged} />
        </div>
      )}

      {panel !== "failed" && (
        <button onClick={() => setPanel("failed")} className="w-full rounded-xl border border-red-200 py-2 text-center text-sm text-red-600 hover:bg-red-50">
          {fr ? "Impossible de terminer" : "Could not complete"}
        </button>
      )}
      {panel === "failed" && (
        <div className="rounded-xl border border-red-200 p-4">
          <FailedForm task={task} onDone={onChanged} />
        </div>
      )}
      {error && !panel && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
