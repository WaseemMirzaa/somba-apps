"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { riderEntities } from "@/lib/warehouse-entities";
import { riderProfile } from "@/lib/rider-entities";

/** Editable rider → zone assignments. Managed by warehouse/admin; surfaced to
 *  riders as their "My Zone" view. Persisted to localStorage. */

const ZONE_OPTIONS = ["Zone A", "Zone B", "Zone C", "Zone D"] as const;

type RiderZoneContextType = {
  zoneOptions: readonly string[];
  getRiderZone: (id: string | number) => string;
  setRiderZone: (id: string | number, zone: string) => void;
};

const RiderZoneContext = createContext<RiderZoneContextType | null>(null);
const STORAGE_KEY = "somba-rider-zones";

function seed(): Record<string, string> {
  const map: Record<string, string> = {};
  riderEntities.forEach((r) => {
    map[String(r.id)] = r.zone;
  });
  map[riderProfile.id] = riderProfile.zone;
  return map;
}

export function RiderZoneProvider({ children }: { children: React.ReactNode }) {
  const [zones, setZones] = useState<Record<string, string>>(seed);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted state from localStorage after mount (SSR-safe; a lazy initializer would cause a hydration mismatch)
      if (raw) setZones({ ...seed(), ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const getRiderZone = useCallback((id: string | number) => zones[String(id)] ?? "", [zones]);

  const setRiderZone = useCallback((id: string | number, zone: string) => {
    setZones((prev) => {
      const next = { ...prev, [String(id)]: zone };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <RiderZoneContext.Provider value={{ zoneOptions: ZONE_OPTIONS, getRiderZone, setRiderZone }}>
      {children}
    </RiderZoneContext.Provider>
  );
}

export function useRiderZones() {
  const ctx = useContext(RiderZoneContext);
  if (!ctx) throw new Error("useRiderZones must be used within RiderZoneProvider");
  return ctx;
}
