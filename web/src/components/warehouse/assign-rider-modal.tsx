"use client";

import { useMemo, useState } from "react";
import { Search, Bike } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { riderEntities, type RiderEntity } from "@/lib/warehouse-entities";

type AssignRiderModalProps = {
  open: boolean;
  title?: string;
  subtitle?: string;
  selectedRiderId?: number | null;
  onClose: () => void;
  onConfirm: (rider: RiderEntity) => void;
};

export function AssignRiderModal({
  open,
  title,
  subtitle,
  selectedRiderId = null,
  onClose,
  onConfirm,
}: AssignRiderModalProps) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const resolvedTitle = title ?? (fr ? "Assigner un livreur" : "Assign rider");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<RiderEntity | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return riderEntities;
    return riderEntities.filter(
      (rider) =>
        rider.name.toLowerCase().includes(q) ||
        rider.zone.toLowerCase().includes(q) ||
        rider.location.toLowerCase().includes(q) ||
        rider.vehicle.toLowerCase().includes(q)
    );
  }, [query]);

  if (!open) return null;

  function close() {
    setQuery("");
    setPicked(null);
    setConfirmStep(false);
    onClose();
  }

  function proceed() {
    if (!picked) return;
    setConfirmStep(true);
  }

  function confirm() {
    if (!picked) return;
    onConfirm(picked);
    setQuery("");
    setPicked(null);
    setConfirmStep(false);
  }

  const initialRider = selectedRiderId
    ? riderEntities.find((rider) => rider.id === selectedRiderId) ?? null
    : null;

  const activeRider = picked ?? initialRider;

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
                  placeholder={fr ? "Rechercher un livreur par nom, zone ou lieu…" : "Search rider name, zone, or location…"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">{fr ? "Aucun livreur ne correspond à votre recherche." : "No riders match your search."}</p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((rider) => {
                    const selected = activeRider?.id === rider.id;
                    return (
                      <li key={rider.id}>
                        <button
                          type="button"
                          onClick={() => setPicked(rider)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                            selected
                              ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                              : "border-[var(--border)] hover:border-indigo-200 hover:bg-slate-50"
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                            <Bike className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">{rider.name}</p>
                            <p className="text-xs text-slate-500">
                              {rider.zone} · {rider.location} · {rider.vehicle}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {rider.activeDeliveries} {fr ? "actives" : "active"} · {rider.performanceScore}% {fr ? "performance" : "performance"} · ⭐ {rider.rating}
                            </p>
                          </div>
                          <span className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                            rider.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          )}>
                            {fr ? (rider.status === "active" ? "actif" : "inactif") : rider.status}
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
                onClick={close}
                className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {fr ? "Annuler" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={proceed}
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
                <>Assigner <strong>{activeRider?.name}</strong> à ce lot ?</>
              ) : (
                <>Assign <strong>{activeRider?.name}</strong> to this batch?</>
              )}
            </p>
            {activeRider && (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-slate-700">
                <p><span className="text-slate-500">{fr ? "Zone :" : "Zone:"}</span> {activeRider.zone}</p>
                <p className="mt-1"><span className="text-slate-500">{fr ? "Lieu :" : "Location:"}</span> {activeRider.location}</p>
                <p className="mt-1"><span className="text-slate-500">{fr ? "Véhicule :" : "Vehicle:"}</span> {activeRider.vehicle}</p>
                <p className="mt-1"><span className="text-slate-500">{fr ? "Livraisons actives :" : "Active deliveries:"}</span> {activeRider.activeDeliveries}</p>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmStep(false)}
                className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {fr ? "Retour" : "Back"}
              </button>
              <button
                type="button"
                onClick={confirm}
                className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-medium"
              >
                {fr ? "Confirmer l'assignation" : "Confirm assignment"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
