"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { replacementEntities, type ReplacementEntity } from "@/lib/warehouse-entities";
import {
  normalizeReplacementStatus,
  REPLACEMENT_STATUS_LABELS,
  type ReplacementStatus,
} from "@/lib/replacement-workflow";

/** Runtime replacement cases — the back-office (warehouse/admin) advances the
 *  workflow and assigns dispatch. Persisted to localStorage. */

type RiderAssignment = { rider: string; riderPhone?: string; batchId?: string; eta?: string };

type ReplacementContextType = {
  replacements: ReplacementEntity[];
  getReplacement: (id: string) => ReplacementEntity | undefined;
  advance: (id: string, to: ReplacementStatus) => void;
  assignRider: (id: string, assignment: RiderAssignment) => void;
};

const ReplacementContext = createContext<ReplacementContextType | null>(null);
const STORAGE_KEY = "somba-replacements";

function seed(): ReplacementEntity[] {
  // Deep clone so we never mutate the shared mock array, and normalize legacy
  // status strings into the canonical workflow.
  const clone = JSON.parse(JSON.stringify(replacementEntities)) as ReplacementEntity[];
  return clone.map((r) => {
    const s = normalizeReplacementStatus(r.status);
    return { ...r, status: s, statusFr: REPLACEMENT_STATUS_LABELS[s].fr };
  });
}

export function ReplacementProvider({ children }: { children: React.ReactNode }) {
  const [replacements, setReplacements] = useState<ReplacementEntity[]>(seed);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setReplacements(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const save = useCallback((next: ReplacementEntity[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const getReplacement = useCallback((id: string) => replacements.find((r) => r.id === id), [replacements]);

  const advance = useCallback(
    (id: string, to: ReplacementStatus) => {
      setReplacements((prev) => {
        const now = new Date().toISOString().slice(0, 16).replace("T", " ");
        const next = prev.map((r) => {
          if (r.id !== id) return r;
          const updated: ReplacementEntity = {
            ...r,
            status: to,
            statusFr: REPLACEMENT_STATUS_LABELS[to].fr,
            timeline: [
              ...r.timeline,
              { time: now, label: REPLACEMENT_STATUS_LABELS[to].en, labelFr: REPLACEMENT_STATUS_LABELS[to].fr, done: true },
            ],
          };
          if (to === "allocated") {
            updated.newProduct = { ...r.newProduct, allocated: true, allocatedAt: now };
          }
          if (to === "dispatched") {
            updated.newProduct = {
              ...updated.newProduct,
              dispatch: { ...updated.newProduct.dispatch, status: "Out for delivery", statusFr: "En livraison" },
            };
          }
          return updated;
        });
        save(next);
        return next;
      });
    },
    [save]
  );

  const assignRider = useCallback(
    (id: string, a: RiderAssignment) => {
      setReplacements((prev) => {
        const next = prev.map((r) =>
          r.id === id
            ? {
                ...r,
                newProduct: {
                  ...r.newProduct,
                  dispatch: {
                    ...r.newProduct.dispatch,
                    rider: a.rider,
                    riderPhone: a.riderPhone ?? r.newProduct.dispatch.riderPhone,
                    batchId: a.batchId ?? r.newProduct.dispatch.batchId,
                    eta: a.eta ?? r.newProduct.dispatch.eta,
                  },
                },
              }
            : r
        );
        save(next);
        return next;
      });
    },
    [save]
  );

  return (
    <ReplacementContext.Provider value={{ replacements, getReplacement, advance, assignRider }}>
      {children}
    </ReplacementContext.Provider>
  );
}

export function useReplacements() {
  const ctx = useContext(ReplacementContext);
  if (!ctx) throw new Error("useReplacements must be used within ReplacementProvider");
  return ctx;
}

// Re-export for convenience
export { normalizeReplacementStatus };
