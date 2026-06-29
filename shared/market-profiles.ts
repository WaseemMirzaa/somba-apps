/** Dual-market profiles: France demo + DRC production (Δ3, Δ8). */

export type MarketProfileId = "france" | "drc";

export type Zone = {
  id: string;
  name: string;
  nameFr: string;
  city: string;
  deliveryFeeUsd: number;
};

export type MarketProfile = {
  id: MarketProfileId;
  label: string;
  cities: { id: string; name: string; nameFr: string }[];
  phonePrefix: string;
  phoneFormat: string;
  currencyPrimary: "USD";
  currencySecondary?: "CDF";
  fxRateUsdCdf?: number;
  zones: Zone[];
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
    zones: [
      { id: "zone-a", name: "Zone A — Centre", nameFr: "Zone A — Centre", city: "Paris", deliveryFeeUsd: 0 },
      { id: "zone-b", name: "Zone B — Nord", nameFr: "Zone B — Nord", city: "Paris", deliveryFeeUsd: 5 },
      { id: "zone-c", name: "Zone C — Sud", nameFr: "Zone C — Sud", city: "Paris", deliveryFeeUsd: 8 },
    ],
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
    zones: [
      { id: "gombe", name: "Gombe", nameFr: "Gombe", city: "Kinshasa", deliveryFeeUsd: 3 },
      { id: "limete", name: "Limete", nameFr: "Limete", city: "Kinshasa", deliveryFeeUsd: 5 },
      { id: "masina", name: "Masina", nameFr: "Masina", city: "Kinshasa", deliveryFeeUsd: 6 },
      { id: "lubumbashi-centre", name: "Centre", nameFr: "Centre", city: "Lubumbashi", deliveryFeeUsd: 4 },
    ],
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

export function getZoneFee(profileId: MarketProfileId, zoneId: string): number {
  const zone = MARKET_PROFILES[profileId].zones.find((z) => z.id === zoneId);
  return zone?.deliveryFeeUsd ?? 0;
}

export function usdToCdf(usd: number, profileId: MarketProfileId = DEFAULT_MARKET_PROFILE): number {
  const rate = MARKET_PROFILES[profileId].fxRateUsdCdf ?? 0;
  return Math.round(usd * rate);
}
