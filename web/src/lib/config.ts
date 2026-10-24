/** Business configuration from product questionnaire. */

export const BRAND = {
  name: "Somba&Teka",
  partner: "Teka",
  fullName: "S&T Marketplace",
  tagline: "Shop smarter. Deliver faster.",
  legalEntity: "Somba Commerce SAS",
  legalAddress: "8 Rue de la Paix, 75002 Paris, France",
  supportEmail: "support@somba.com",
  copyright: "© 2026 Somba Commerce SAS. All rights reserved.",
  copyrightFr: "© 2026 Somba Commerce SAS. Tous droits réservés.",
} as const;

export const MARKET = {
  currency: "USD" as const,
} as const;

export const LEGAL_LINKS = [
  { label: "Terms of Use", labelFr: "Conditions d'utilisation", href: "/legal/terms" },
  { label: "Privacy Policy", labelFr: "Politique de confidentialité", href: "/legal/privacy" },
  { label: "Return Policy", labelFr: "Politique de retour", href: "/legal/returns" },
  { label: "Seller Agreement", labelFr: "Contrat vendeur", href: "/legal/seller" },
  { label: "Shipping Policy", labelFr: "Politique d'expédition", href: "/legal/shipping" },
] as const;
