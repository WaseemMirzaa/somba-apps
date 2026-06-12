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
  crossCityDelivery: false, // Q2: inter-city orders disabled at launch (single-city; enabled once more warehouses are added)
  openBoxDelivery: true,
  guestCheckout: true,
  // Q10: commission is per-category (default applies when a category has no override). Rates TBD with client.
  commission: {
    default: 12,
    electronics: 8,
    fashion: 15,
    grocery: 10,
    tiered: { gold: 10, silver: 12, bronze: 14 } as Record<string, number>,
  },
} as const;

/** Per-category commission overrides, editable in Admin → Settings. */
export const COMMISSION_CATEGORIES = [
  { id: "electronics", label: "Electronics", labelFr: "Électronique", rate: 8 },
  { id: "fashion", label: "Fashion", labelFr: "Mode", rate: 15 },
  { id: "home", label: "Home & Living", labelFr: "Maison", rate: 12 },
  { id: "beauty", label: "Beauty", labelFr: "Beauté", rate: 12 },
  { id: "grocery", label: "Grocery", labelFr: "Épicerie", rate: 10 },
  { id: "books", label: "Books", labelFr: "Livres", rate: 10 },
  { id: "toys", label: "Toys", labelFr: "Jouets", rate: 12 },
  { id: "sports", label: "Sports", labelFr: "Sport", rate: 12 },
] as const;

export const PAYMENTS = {
  // Q8: Cash on Delivery removed. Q7: Airtel + Orange + Vodacom (M-Pesa) mobile money.
  methods: ["stripe_card", "airtel_money", "orange_money", "vodacom_mpesa", "wallet"] as const,
  codEnabled: false,
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
  orange: { mock: true },
  vodacom: { mock: true },
} as const;

/** Mobile-money providers (Q7). */
export const MOBILE_MONEY = [
  { id: "airtel_money", label: "Airtel Money", operator: "Airtel Congo" },
  { id: "orange_money", label: "Orange Money", operator: "Orange Telecom" },
  { id: "vodacom_mpesa", label: "Vodacom M-Pesa", operator: "Vodacom" },
] as const;

/** Returns policy (Q18, Q19, Q20). */
export const RETURNS = {
  windowDays: 7,
  nonReturnableCategories: [
    { label: "Food & beverages", labelFr: "Alimentation et boissons" },
    { label: "Personal care & hygiene", labelFr: "Soins personnels et hygiène" },
    { label: "Underwear", labelFr: "Sous-vêtements" },
    { label: "Customized products", labelFr: "Produits personnalisés" },
    { label: "Digital products", labelFr: "Produits numériques" },
  ],
  costBearers: ["seller", "platform"] as const, // Q19
  refundDestinations: ["original", "store_credit"] as const, // Q20
} as const;

export const LEGAL_LINKS = [
  { label: "Terms of Use", href: "/legal/terms" },
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Return Policy", href: "/legal/returns" },
  { label: "Seller Agreement", href: "/legal/seller" },
  { label: "Shipping Policy", href: "/legal/shipping" },
] as const;
