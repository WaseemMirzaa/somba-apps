/** Business configuration from product questionnaire. */

export const BRAND = {
  name: "KOMORIKO",
  partner: "Teka",
  fullName: "KOMORIKO",
  tagline: "Shop smarter. Deliver faster.",
  legalEntity: "KOMORIKO",
  legalAddress: "8 Rue de la Paix, 75002 Paris, France",
  supportEmail: "support@komoriko.com",
  copyright: "© 2026 KOMORIKO. All rights reserved.",
  copyrightFr: "© 2026 KOMORIKO. Tous droits réservés.",
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
