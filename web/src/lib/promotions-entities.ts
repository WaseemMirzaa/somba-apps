/** Seller promotion requests — sellers request promotions; the platform reviews & publishes (Q14). */

export type PromotionRequest = {
  id: string;
  seller: string;
  campaign: string;
  type: "discount" | "coupon";
  value: string;
  scope: string;
  start: string;
  end: string;
  status: "pending" | "approved" | "rejected";
  date: string;
};

export const PROMOTION_REQUESTS: PromotionRequest[] = [
  { id: "PR-2041", seller: "TechZone Store", campaign: "Soldes électronique", type: "discount", value: "20%", scope: "Catégorie Électronique", start: "2026-06-15", end: "2026-06-22", status: "pending", date: "2026-06-12" },
  { id: "PR-2040", seller: "Fashion Hub", campaign: "Nouvelle collection", type: "coupon", value: "MODE10", scope: "Toute la boutique", start: "2026-06-14", end: "2026-06-30", status: "pending", date: "2026-06-12" },
  { id: "PR-2039", seller: "AudioHub", campaign: "Casques en promo", type: "discount", value: "15%", scope: "3 produits", start: "2026-06-13", end: "2026-06-20", status: "pending", date: "2026-06-11" },
  { id: "PR-2038", seller: "HomeEssentials", campaign: "Livraison offerte", type: "coupon", value: "FREELIV", scope: "Commandes > $50", start: "2026-06-10", end: "2026-06-17", status: "approved", date: "2026-06-09" },
  { id: "PR-2037", seller: "QuickDeals Store", campaign: "Méga remise -70%", type: "discount", value: "70%", scope: "Toute la boutique", start: "2026-06-08", end: "2026-06-09", status: "rejected", date: "2026-06-07" },
];
