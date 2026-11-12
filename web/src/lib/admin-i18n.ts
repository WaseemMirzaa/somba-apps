import type { Locale } from "./i18n";
import { t } from "./i18n";

export const PERMISSION_SCOPE_LABELS: Record<string, { en: string; fr: string }> = {
  all: { en: "All access", fr: "Accès total" },
  orders: { en: "Orders", fr: "Commandes" },
  warehouse: { en: "Warehouse", fr: "Entrepôt" },
  logistics: { en: "Logistics", fr: "Logistique" },
  payouts: { en: "Payouts", fr: "Versements" },
  refunds: { en: "Refunds", fr: "Remboursements" },
  payments: { en: "Payments", fr: "Paiements" },
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

/**
 * The audit log stores machine codes (`flashsale.approve`, `warehouse_staff`, `category`...). The Audit page shows them
 * in the viewer's language; a code this table does not know is shown as written (a new action never disappears).
 */
export const AUDIT_ACTION_LABELS: Record<string, { en: string; fr: string }> = {
  "broadcast.sent": { en: "Broadcast sent", fr: "Diffusion envoyée" },
  "category.create": { en: "Category created", fr: "Catégorie créée" },
  "category.update": { en: "Category updated", fr: "Catégorie modifiée" },
  "category.remove": { en: "Category removed", fr: "Catégorie supprimée" },
  "cms.upsert": { en: "CMS content saved", fr: "Contenu CMS enregistré" },
  "coverage.removed": { en: "Coverage area removed", fr: "Zone de couverture retirée" },
  "delivery.code_failed": { en: "Delivery code refused", fr: "Code de livraison refusé" },
  "delivery.code_locked": { en: "Delivery code locked", fr: "Code de livraison verrouillé" },
  "delivery.code_unlocked": { en: "Delivery code unlocked", fr: "Code de livraison déverrouillé" },
  "delivery.proof_viewed": { en: "Proof of delivery viewed", fr: "Preuve de livraison consultée" },
  "dispute.rejected": { en: "Dispute rejected", fr: "Litige rejeté" },
  "exchange.create": { en: "Exchange created", fr: "Échange créé" },
  "flashsale.create": { en: "Flash sale created", fr: "Vente flash créée" },
  "flashsale.update": { en: "Flash sale updated", fr: "Vente flash modifiée" },
  "flashsale.approve": { en: "Flash sale approved", fr: "Vente flash approuvée" },
  "flashsale.decline": { en: "Flash sale declined", fr: "Vente flash refusée" },
  "flashsale.end": { en: "Flash sale ended", fr: "Vente flash terminée" },
  "flashsale.delete": { en: "Flash sale deleted", fr: "Vente flash supprimée" },
  "geo.created": { en: "Area created", fr: "Zone créée" },
  "geo.updated": { en: "Area updated", fr: "Zone modifiée" },
  "hub.settings.updated": { en: "Hub settings updated", fr: "Paramètres du hub modifiés" },
  "order.cancelled": { en: "Order cancelled", fr: "Commande annulée" },
  "order.status": { en: "Order status changed", fr: "Statut de commande modifié" },
  "parcel.dispatched": { en: "Parcel dispatched", fr: "Colis expédié" },
  "parcel.marked_by_hand": { en: "Parcel marked by hand", fr: "Colis marqué à la main" },
  "parcel.received": { en: "Parcel received", fr: "Colis reçu" },
  "parcel.returned_to_seller": { en: "Parcel returned to seller", fr: "Colis retourné au vendeur" },
  "password.changed_first": { en: "First password set", fr: "Premier mot de passe défini" },
  "payment.confirmed": { en: "Payment confirmed", fr: "Paiement confirmé" },
  "payment.declined": { en: "Payment declined", fr: "Paiement refusé" },
  payout: { en: "Payout", fr: "Versement" },
  "payout.paid": { en: "Payout paid", fr: "Versement payé" },
  "payout.rejected": { en: "Payout rejected", fr: "Versement rejeté" },
  "payout.sent": { en: "Payout sent", fr: "Versement envoyé" },
  "product.removed": { en: "Listing blocked", fr: "Annonce bloquée" },
  "product.live": { en: "Listing approved", fr: "Annonce approuvée" },
  "product.rejected": { en: "Listing rejected", fr: "Annonce refusée" },
  "product.pending": { en: "Listing sent back for review", fr: "Annonce remise en modération" },
  "product.draft": { en: "Listing set to draft", fr: "Annonce remise en brouillon" },
  "promo.create": { en: "Promo code created", fr: "Code promo créé" },
  "return.graded": { en: "Return graded", fr: "Retour évalué" },
  "return.received": { en: "Return received", fr: "Retour reçu" },
  "review.hidden": { en: "Review hidden", fr: "Avis masqué" },
  "rider.document.approved": { en: "Rider document approved", fr: "Document du livreur approuvé" },
  "rider.document.rejected": { en: "Rider document rejected", fr: "Document du livreur refusé" },
  "rider.vehicle.updated": { en: "Rider vehicle updated", fr: "Véhicule du livreur modifié" },
  "role.set": { en: "Role set", fr: "Rôle défini" },
  "run.created": { en: "Transfer run created", fr: "Tournée de transfert créée" },
  "run.updated": { en: "Transfer run updated", fr: "Tournée de transfert modifiée" },
  "run.assigned": { en: "Transfer run assigned", fr: "Tournée de transfert assignée" },
  "run.dispatched": { en: "Transfer run dispatched", fr: "Tournée de transfert expédiée" },
  "run.received": { en: "Transfer run received", fr: "Tournée de transfert reçue" },
  "run.split": { en: "Transfer run split", fr: "Tournée de transfert scindée" },
  "run.closed": { en: "Transfer run closed", fr: "Tournée de transfert clôturée" },
  "session.refresh_reuse": { en: "Session token reused: all sessions signed out", fr: "Jeton de session réutilisé : toutes les sessions déconnectées" },
  "settings.set": { en: "Setting changed", fr: "Paramètre modifié" },
  "staff.created": { en: "Staff account created", fr: "Compte du personnel créé" },
  "staff.email_changed": { en: "Staff e-mail changed", fr: "E-mail du personnel modifié" },
  "staff.hub": { en: "Staff hub changed", fr: "Hub du personnel modifié" },
  "staff.password_reissued": { en: "Staff password re-issued", fr: "Mot de passe du personnel réémis" },
  "staff.deactivate": { en: "Staff account deactivated", fr: "Compte du personnel désactivé" },
  "staff.reactivate": { en: "Staff account reactivated", fr: "Compte du personnel réactivé" },
  "stock.count": { en: "Stock count recorded", fr: "Comptage de stock enregistré" },
  "task.assigned": { en: "Delivery task assigned", fr: "Tâche de livraison assignée" },
  "user.suspend": { en: "User suspended", fr: "Utilisateur suspendu" },
  "user.reactivate": { en: "User reactivated", fr: "Utilisateur réactivé" },
};

const CAMPAIGN_ACTION_FR: Record<string, { en: string; fr: string }> = {
  approved: { en: "approved", fr: "approuvée" },
  rejected: { en: "rejected", fr: "refusée" },
  active: { en: "started", fr: "démarrée" },
  scheduled: { en: "scheduled", fr: "planifiée" },
  ended: { en: "ended", fr: "terminée" },
  pending: { en: "submitted", fr: "soumise" },
  draft: { en: "set to draft", fr: "remise en brouillon" },
};

/** `exchange.<status>` / `replacement.<status>`: the request moved to this step (the status the server wrote). */
const AFTER_SALE_STEP: Record<string, { en: string; fr: string }> = {
  requested: { en: "requested", fr: "demandé" },
  approved: { en: "approved", fr: "approuvé" },
  received: { en: "received", fr: "reçu" },
  ready: { en: "ready", fr: "prêt" },
  allocated: { en: "allocated", fr: "alloué" },
  dispatched: { en: "dispatched", fr: "expédié" },
  delivered: { en: "delivered", fr: "livré" },
  rejected: { en: "rejected", fr: "refusé" },
  create: { en: "created", fr: "créé" },
};

export function auditActionLabel(action: string, fr: boolean) {
  const hit = AUDIT_ACTION_LABELS[action];
  if (hit) return fr ? hit.fr : hit.en;
  const afterSale = /^(exchange|replacement)\.(\w+)$/.exec(action);
  if (afterSale) {
    const step = AFTER_SALE_STEP[afterSale[2]];
    if (step) {
      const noun = afterSale[1] === "exchange" ? { en: "Exchange", fr: "Échange" } : { en: "Replacement", fr: "Remplacement" };
      return fr ? `${noun.fr} ${step.fr}` : `${noun.en} ${step.en}`;
    }
  }
  const campaign = /^campaign\.(\w+)$/.exec(action);
  if (campaign) {
    const st = CAMPAIGN_ACTION_FR[campaign[1]];
    if (st) return fr ? `Campagne ${st.fr}` : `Campaign ${st.en}`;
  }
  return action;
}

export const AUDIT_ENTITY_LABELS: Record<string, { en: string; fr: string }> = {
  broadcast: { en: "Broadcast", fr: "Diffusion" },
  campaign: { en: "Campaign", fr: "Campagne" },
  category: { en: "Category", fr: "Catégorie" },
  cms: { en: "CMS", fr: "CMS" },
  coverage: { en: "Coverage", fr: "Couverture" },
  delivery: { en: "Delivery", fr: "Livraison" },
  dispute: { en: "Dispute", fr: "Litige" },
  exchange: { en: "Exchange", fr: "Échange" },
  flashsale: { en: "Flash sale", fr: "Vente flash" },
  geo: { en: "Area", fr: "Zone" },
  hub: { en: "Hub", fr: "Hub" },
  order: { en: "Order", fr: "Commande" },
  parcel: { en: "Parcel", fr: "Colis" },
  payment: { en: "Payment", fr: "Paiement" },
  payout: { en: "Payout", fr: "Versement" },
  product: { en: "Listing", fr: "Annonce" },
  promo: { en: "Promo code", fr: "Code promo" },
  return: { en: "Return", fr: "Retour" },
  review: { en: "Review", fr: "Avis" },
  rider: { en: "Rider", fr: "Livreur" },
  role: { en: "Role", fr: "Rôle" },
  run: { en: "Transfer run", fr: "Tournée de transfert" },
  session: { en: "Session", fr: "Session" },
  setting: { en: "Setting", fr: "Paramètre" },
  settings: { en: "Settings", fr: "Paramètres" },
  staff: { en: "Staff", fr: "Personnel" },
  stock: { en: "Stock", fr: "Stock" },
  task: { en: "Task", fr: "Tâche" },
  user: { en: "User", fr: "Utilisateur" },
  warehouse: { en: "Warehouse", fr: "Entrepôt" },
};

export function auditEntityLabel(entity: string, fr: boolean) {
  const hit = AUDIT_ENTITY_LABELS[entity];
  return hit ? (fr ? hit.fr : hit.en) : entity;
}

export const AUDIT_ROLE_LABELS: Record<string, { en: string; fr: string }> = {
  admin: { en: "Super admin", fr: "Super admin" },
  admin_finance: { en: "Finance admin", fr: "Admin Finance" },
  admin_operations: { en: "Operations admin", fr: "Admin Opérations" },
  admin_marketing: { en: "Marketing admin", fr: "Admin Marketing" },
  admin_support: { en: "Support admin", fr: "Admin Support" },
  admin_moderation: { en: "Moderation admin", fr: "Admin Modération" },
  warehouse_staff: { en: "Warehouse staff", fr: "Personnel d'entrepôt" },
  rider: { en: "Rider", fr: "Livreur" },
  seller: { en: "Seller", fr: "Vendeur" },
  customer: { en: "Customer", fr: "Client" },
  system: { en: "System", fr: "Système" },
};

export function auditRoleLabel(role: string, fr: boolean) {
  const hit = AUDIT_ROLE_LABELS[role];
  return hit ? (fr ? hit.fr : hit.en) : role;
}

export const PLAN_LABELS: Record<string, { en: string; fr: string }> = {
  free: { en: "Free", fr: "Gratuit" },
  starter: { en: "Starter", fr: "Starter" },
  pro: { en: "Professional", fr: "Professionnel" },
  enterprise: { en: "Enterprise", fr: "Entreprise" },
};

/** A seller plan id (`pro`) as its name. An id this table does not know is shown as written. */
export function planName(id: string | null | undefined, fr: boolean) {
  const hit = id ? PLAN_LABELS[id] : undefined;
  return hit ? (fr ? hit.fr : hit.en) : id ?? "";
}

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
