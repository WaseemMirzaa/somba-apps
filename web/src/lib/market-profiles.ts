export type MarketProfileId = "france" | "drc";

export type MarketProfile = {
  id: MarketProfileId;
  label: string;
  cities: { id: string; name: string; nameFr: string }[];
  phonePrefix: string;
  phoneFormat: string;
  currencyPrimary: "USD";
  currencySecondary?: "CDF";
  fxRateUsdCdf?: number;
  returnWindowDays: number;
  payoutMinUsd: number;
  payoutClearanceHours: number;
};

export const MARKET_PROFILES: Record<MarketProfileId, MarketProfile> = {
  france: {
    id: "france",
    label: "France (Demo)",
    cities: [
      { id: "paris", name: "Paris", nameFr: "Paris" },
      { id: "lyon", name: "Lyon", nameFr: "Lyon" },
    ],
    phonePrefix: "+33",
    phoneFormat: "+33 X XX XX XX XX",
    currencyPrimary: "USD",
    returnWindowDays: 30,
    payoutMinUsd: 10,
    payoutClearanceHours: 48,
  },
  drc: {
    id: "drc",
    label: "DRC (Production)",
    cities: [
      { id: "kinshasa", name: "Kinshasa", nameFr: "Kinshasa" },
      { id: "lubumbashi", name: "Lubumbashi", nameFr: "Lubumbashi" },
    ],
    phonePrefix: "+243",
    phoneFormat: "+243 XXX XXX XXX",
    currencyPrimary: "USD",
    currencySecondary: "CDF",
    fxRateUsdCdf: 2850,
    returnWindowDays: 7,
    payoutMinUsd: 10,
    payoutClearanceHours: 48,
  },
};

export const DEFAULT_MARKET_PROFILE: MarketProfileId =
  (process.env.NEXT_PUBLIC_MARKET_PROFILE as MarketProfileId) || "france";

export function getMarketProfile(id: MarketProfileId = DEFAULT_MARKET_PROFILE): MarketProfile {
  return MARKET_PROFILES[id];
}

export function usdToCdf(usd: number, profileId: MarketProfileId = DEFAULT_MARKET_PROFILE): number {
  const rate = MARKET_PROFILES[profileId].fxRateUsdCdf ?? 0;
  return Math.round(usd * rate);
}
