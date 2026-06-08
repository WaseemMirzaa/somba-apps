/** Business configuration from product questionnaire. */

export const BRAND = {
  name: "Somba",
  partner: "Tekka",
  fullName: "Somba & Tekka",
  tagline: "Shop smarter. Deliver faster.",
  legalEntity: "Somba Commerce SAS",
  legalAddress: "8 Rue de la Paix, 75002 Paris, France",
  cin: "RCS Paris 912 345 678",
  gstVat: "FR12 345678901",
  supportEmail: "support@somba.com",
  copyright: "© 2026 Somba Commerce SAS. All rights reserved.",
} as const;

export type MarketProfileId = "france" | "drc";

export const MARKET_PROFILE: MarketProfileId =
  (process.env.NEXT_PUBLIC_MARKET_PROFILE as MarketProfileId) || "france";

export const MARKET = {
  primary: ["France", "Global", "Kinshasa", "Lubumbashi"],
  defaultLocale: "en" as const,
  locales: ["en", "fr"] as const,
  currency: "USD" as const,
  currencySecondary: "CDF" as const,
  currencySymbol: "$",
  phoneFormat: "+33 X XX XX XX XX",
  dateFormat: "DD/MM/YYYY",
  profile: MARKET_PROFILE,
} as const;

export const BUSINESS = {
  model: "marketplace" as const,
  inventoryOwner: "seller" as const,
  fulfillment: "hybrid" as const,
  crossCityDelivery: true,
  openBoxDelivery: true,
  guestCheckout: true,
  commission: {
    default: 12,
    electronics: 8,
    fashion: 15,
    grocery: 10,
    tiered: { gold: 10, silver: 12, bronze: 14 } as Record<string, number>,
  },
} as const;

export const PAYMENTS = {
  methods: ["stripe_card", "cod", "airtel_money", "wallet"] as const,
  cod: {
    otpRequired: true,
    maxPerCustomer: 3,
    maxAmount: 500,
    addressBlocklist: true,
  },
  wallet: {
    storeCredit: true,
    topUpViaMobileMoney: true,
    refundToWallet: true,
    refundToOriginal: true,
  },
  stripe: { mock: true, publishableKey: "pk_test_somba_mock" },
  airtel: { mock: true },
} as const;

export const LEGAL_LINKS = [
  { label: "Terms of Use", href: "/legal/terms" },
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Return Policy", href: "/legal/returns" },
  { label: "Seller Agreement", href: "/legal/seller" },
  { label: "Shipping Policy", href: "/legal/shipping" },
] as const;
