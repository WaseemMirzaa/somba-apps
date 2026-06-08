"use client";

import { createContext, useContext, useState, useCallback } from "react";
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

  return (
    <MarketContext.Provider
      value={{
        profileId,
        profile,
        setProfileId,
        getZoneFee: (zoneId) => getZoneFee(profileId, zoneId),
        usdToCdf: (usd) => usdToCdf(usd, profileId),
        showDualCurrency: !!profile.currencySecondary,
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
