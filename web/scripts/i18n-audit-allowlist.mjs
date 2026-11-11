/**
 * Allowlist for scripts/i18n-audit.mjs: strings that are IDENTICAL in English and French on purpose.
 * Anything not matched here and found identical in both languages is reported as a finding.
 *
 * Keep this short and justified: every entry needs a comment saying why it legitimately stays the same.
 */

/** Exact strings (compared after trimming and collapsing whitespace, case-insensitive). */
export const ALLOW_EXACT = [
  "KOMORIKO", // brand name
  "LipCart", // legacy brand word that still appears in some marketing copy
  "Teka", // partner brand
  "Mobile Money", // payment product name, spelled the same in French
  "Orange Money", // payment brand
  "Airtel Money", // payment brand
  "M-Pesa", // payment brand
  "Google Play", // store brand
  "App Store", // store brand
  "Apple Pay", // payment brand
  "Google Maps", // brand
  "Stripe", // payment brand
  "Visa", // payment brand
  "Mastercard", // payment brand
  "Instagram", // social brand
  "Facebook", // social brand
  "WhatsApp", // social brand
  "TikTok", // social brand
  "Wi-Fi", // generic term
  "8 Rue de la Paix, 75002 Paris, France", // the company address (BRAND.legalAddress): a postal address, same in both languages
];

/**
 * Names of people, stores and products in the seeded demo data (`npm run seed:demo`). They are DATA, written by the
 * people who own them, and stay the same in both languages. Add the names of your own demo set here if it differs.
 */
export const ALLOW_DATA_NAMES = [
  "Maison Kinshasa", // demo store
  "Limete Grossiste", // demo store
  "Kasa-Vubu Artisanat", // demo store
  "Ndolo Électro", // demo store
  "Grace Mbuyi", // demo customer
  "Marie Dubois", // demo customer
  "Patrick Kasongo", // demo customer
  "Smartphone A15", // demo product: a model name ("A15") with the generic word kept in both languages by the server
  "Gombe, Kinshasa", // demo address (place names)
  "Maluku, Kinshasa", // demo address (place names)
  "Family (Maluku)", // address label typed by the demo customer
  "Somba@2026", // the demo password printed on the /live developer console in a demo build
];

/** Regular expressions tested against every candidate string. */
export const ALLOW_PATTERNS = [
  /^[\W\d_]+$/, // no letters at all: numbers, prices, punctuation
  /^[\w.+-]+@[\w.-]+\.\w+$/, // an email address typed by a person or shown as data
  /^https?:\/\//, // a URL
  /^[A-Z0-9-]{6,}$/, // order / tracking / voucher codes such as ORD-2026-0001
  /^\+?\d[\d\s().-]{6,}$/, // phone numbers
  /^(©|©)\s?\d{4}/, // the copyright line is already localized through BRAND.copyrightFr when it differs
];
