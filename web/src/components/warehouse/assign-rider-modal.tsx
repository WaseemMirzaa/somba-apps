"use client";

import { useMemo, useState } from "react";
import { Search, Bike } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { errorMessage, useOpsQuery, type WarehouseRider } from "@/lib/warehouse-live";

type AssignRiderModalProps = {
  open: boolean;
  title?: string;
  subtitle?: string;
  selectedRiderId?: string | null;
  onClose: () => void;
  /**
   * Called with the chosen real rider. It must perform the server request and
   * reject with the server's error on failure — the modal shows that message
   * and stays open; it closes only when the promise resolves.
   */
  onConfirm: (rider: WarehouseRider) => Promise<void>;
};

export function AssignRiderModal(props: AssignRiderModalProps) {
  // Mount the body only while open so riders are loaded on demand.
  if (!props.open) return null;
  return <AssignRiderModalBody {...props} />;
}

function AssignRiderModalBody({
  title,
  subtitle,
  selectedRiderId = null,
  onClose,
  onConfirm,
}: AssignRiderModalProps) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const resolvedTitle = title ?? (fr ? "Assigner un livreur" : "Assign rider");
  const ridersQ = useOpsQuery<WarehouseRider[]>("warehouse:riders", {
    initial: [] as WarehouseRider[],
    push: ["delivery:updated"],
  });
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(selectedRiderId);
  const [confirmStep, setConfirmStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ridersQ.data;
    return ridersQ.data.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.phone ?? "").toLowerCase().includes(q),
    );
  }, [query, ridersQ.data]);

  const activeRider = ridersQ.data.find((r) => r.id === pickedId) ?? null;

  async function confirm() {
    if (!activeRider || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(activeRider);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setConfirmStep(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card-premium flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden">
        {!confirmStep ? (
          <>
            <div className="border-b border-[var(--border)] px-6 py-5">
              <h3 className="text-lg font-semibold text-slate-900">{resolvedTitle}</h3>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  className="input-premium w-full py-2.5 pl-10 pr-3 text-sm"
                  placeholder={fr ? "Rechercher un livreur par nom ou téléphone…" : "Search rider name or phone…"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {error && (
                <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
              {ridersQ.error ? (
                <p role="alert" className="py-8 text-center text-sm text-red-600">{ridersQ.error}</p>
              ) : ridersQ.loading ? (
                <p className="py-8 text-center text-sm text-slate-400">{fr ? "Chargement des livreurs…" : "Loading riders…"}</p>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {ridersQ.data.length === 0
                    ? (fr ? "Aucun livreur actif." : "No active riders.")
                    : (fr ? "Aucun livreur ne correspond à votre recherche." : "No riders match your search.")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((rider) => {
                    const selected = activeRider?.id === rider.id;
                    return (
                      <li key={rider.id}>
                        <button
                          type="button"
                          onClick={() => setPickedId(rider.id)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                            selected
                              ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                              : "border-[var(--border)] hover:border-indigo-200 hover:bg-slate-50",
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                            <Bike className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">{rider.name}</p>
                            <p className="text-xs text-slate-500">{rider.phone ?? "—"}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            {rider.activeTasks} {fr ? "actives" : "active"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex gap-3 border-t border-[var(--border)] px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {fr ? "Annuler" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmStep(true)}
                disabled={!activeRider}
                className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fr ? "Continuer" : "Continue"}
              </button>
            </div>
          </>
        ) : (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-slate-900">{fr ? "Confirmer l'assignation du livreur" : "Confirm rider assignment"}</h3>
            <p className="mt-3 text-sm text-slate-600">
              {fr ? (
                <>Assigner <strong>{activeRider?.name}</strong> ?</>
              ) : (
                <>Assign <strong>{activeRider?.name}</strong>?</>
              )}
            </p>
            {activeRider && (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-slate-700">
                <p><span className="text-slate-500">{fr ? "Téléphone :" : "Phone:"}</span> {activeRider.phone ?? "—"}</p>
                <p className="mt-1"><span className="text-slate-500">{fr ? "Livraisons actives :" : "Active deliveries:"}</span> {activeRider.activeTasks}</p>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmStep(false)}
                disabled={busy}
                className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {fr ? "Retour" : "Back"}
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {busy ? (fr ? "Assignation…" : "Assigning…") : (fr ? "Confirmer l'assignation" : "Confirm assignment")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
