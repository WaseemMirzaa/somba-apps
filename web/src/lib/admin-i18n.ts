import type { Locale } from "./i18n";
import { t } from "./i18n";

export const PERMISSION_SCOPE_LABELS: Record<string, { en: string; fr: string }> = {
  all: { en: "All access", fr: "Accès total" },
  orders: { en: "Orders", fr: "Commandes" },
  warehouse: { en: "Warehouse", fr: "Entrepôt" },
  logistics: { en: "Logistics", fr: "Logistique" },
  payouts: { en: "Payouts", fr: "Versements" },
  refunds: { en: "Refunds", fr: "Remboursements" },
  cod: { en: "Payment reconciliation", fr: "Réconciliation des paiements" },
  reports: { en: "Reports", fr: "Rapports" },
  tickets: { en: "Tickets", fr: "Tickets" },
  customers: { en: "Customers", fr: "Clients" },
  returns: { en: "Returns", fr: "Retours" },
  campaigns: { en: "Campaigns", fr: "Campagnes" },
  cms: { en: "CMS", fr: "CMS" },
  coupons: { en: "Coupons", fr: "Coupons" },
  banners: { en: "Banners", fr: "Bannières" },
  products: { en: "Products", fr: "Produits" },
  reviews: { en: "Reviews", fr: "Avis" },
  sellers: { en: "Sellers", fr: "Vendeurs" },
  inventory: { en: "Inventory", fr: "Inventaire" },
  dispatch: { en: "Dispatch", fr: "Expédition" },
  hubs: { en: "Hubs", fr: "Hubs" },
};

export const CMS_BLOCK_TYPE_LABELS: Record<string, { en: string; fr: string }> = {
  hero: { en: "Hero banner", fr: "Bannière héro" },
  category_grid: { en: "Category grid", fr: "Grille de catégories" },
  flash_sale: { en: "Flash sale strip", fr: "Bandeau vente flash" },
  product_carousel: { en: "Product carousel", fr: "Carrousel produits" },
  store_grid: { en: "Store grid", fr: "Grille boutiques" },
};

export const CMS_BLOCK_TITLES: Record<string, { en: string; fr: string }> = {
  hero: { en: "Hero Banner", fr: "Bannière héro" },
  categories: { en: "Category Grid", fr: "Grille de catégories" },
  flash: { en: "Flash Sale Strip", fr: "Bandeau vente flash" },
  trending: { en: "Trending Products", fr: "Produits tendance" },
  stores: { en: "Top Stores", fr: "Meilleures boutiques" },
};

export const CATEGORY_LABELS: Record<string, { en: string; fr: string }> = {
  Electronics: { en: "Electronics", fr: "Électronique" },
  Fashion: { en: "Fashion", fr: "Mode" },
  "Home & Living": { en: "Home & Living", fr: "Maison" },
  Home: { en: "Home", fr: "Maison" },
  Beauty: { en: "Beauty", fr: "Beauté" },
  Sports: { en: "Sports", fr: "Articles de sport" },
  Books: { en: "Books", fr: "Livres" },
  Toys: { en: "Toys", fr: "Jouets" },
  Grocery: { en: "Grocery", fr: "Épicerie" },
};

export function adminBreadcrumb(locale: Locale) {
  return { label: t(locale, "admin"), href: "/admin" as const };
}

export function permissionLabel(scope: string, fr: boolean) {
  const entry = PERMISSION_SCOPE_LABELS[scope];
  return entry ? (fr ? entry.fr : entry.en) : scope;
}

export function cmsBlockTypeLabel(type: string, fr: boolean) {
  const entry = CMS_BLOCK_TYPE_LABELS[type];
  return entry ? (fr ? entry.fr : entry.en) : type;
}

export function cmsBlockTitle(id: string, fallback: string, fr: boolean) {
  const entry = CMS_BLOCK_TITLES[id];
  return entry ? (fr ? entry.fr : entry.en) : fallback;
}

export function categoryLabel(name: string, fr: boolean) {
  const entry = CATEGORY_LABELS[name];
  return entry ? (fr ? entry.fr : entry.en) : name;
}

export { t, type Locale } from "./i18n";

export function customerColumnLabel(locale: Locale) {
  return t(locale, "customer");
}

export function zoneColumnLabel(locale: Locale) {
  return t(locale, "zone");
}
