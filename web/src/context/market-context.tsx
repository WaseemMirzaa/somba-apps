"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import {
  type MarketProfileId,
  type MarketProfile,
  MARKET_PROFILES,
  DEFAULT_MARKET_PROFILE,
  getZoneFee,
  usdToCdf,
} from "@/lib/market-profiles";

type MarketContextType = {
  profileId: MarketProfileId;
  profile: MarketProfile;
  setProfileId: (id: MarketProfileId) => void;
  getZoneFee: (zoneId: string) => number;
  usdToCdf: (usd: number) => number;
  showDualCurrency: boolean;
  /** USD -> CDF rate from the public `fxRate` setting (null until the server answers or when unset). */
  fxRate: number | null;
};

const MarketContext = createContext<MarketContextType | null>(null);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [profileId, setProfileIdState] = useState<MarketProfileId>(DEFAULT_MARKET_PROFILE);

  const setProfileId = useCallback((id: MarketProfileId) => {
    setProfileIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("somba_market_profile", id);
    }
  }, []);

  const profile = MARKET_PROFILES[profileId];
  const rt = useRealtime();
  const [fxRate, setFxRate] = useState<number | null>(null);

  // The exchange rate is a server setting (admin > Settings), not a constant.
  useEffect(() => {
    if (rt.status !== "connected") return;
    let alive = true;
    const parse = (raw: Record<string, string>) => {
      const n = Number(raw.fxRate);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    socketClient
      .request<Record<string, string>>("settings:get")
      .then((raw) => alive && setFxRate(parse(raw)))
      .catch(() => {});
    const sock = socketClient.current;
    const onUpdate = (raw: Record<string, string>) => {
      if (raw && "fxRate" in raw) setFxRate(parse(raw));
    };
    sock?.on("settings:updated", onUpdate);
    return () => {
      alive = false;
      sock?.off("settings:updated", onUpdate);
    };
  }, [rt.status]);

  return (
    <MarketContext.Provider
      value={{
        profileId,
        profile,
        setProfileId,
        getZoneFee: (zoneId) => getZoneFee(profileId, zoneId),
        usdToCdf: (usd) => (fxRate ? Math.round(usd * fxRate) : usdToCdf(usd, profileId)),
        showDualCurrency: !!fxRate,
        fxRate,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarket must be used within MarketProvider");
  return ctx;
}
