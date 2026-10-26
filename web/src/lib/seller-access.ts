/**
 * Team roles and what they may do (docs/contracts/seller-platform.md §0). The server enforces it; the portal uses the
 * same table to hide what a role cannot use, so a finance clerk never lands on a page that only answers with an error.
 */
export type SellerPermission =
  | "any"
  | "insight"
  | "catalog_read"
  | "catalog"
  | "orders"
  | "finance"
  | "support"
  | "storefront"
  | "team"
  | "payout_account"
  | "account";

export type TeamRole = "owner" | "manager" | "catalog" | "orders" | "finance" | "support";

export const TEAM_ROLES: TeamRole[] = ["manager", "catalog", "orders", "finance", "support"];

export interface SellerMembership {
  role: TeamRole;
  isOwner: boolean;
  permissions: SellerPermission[];
}

export const TEAM_ROLE_LABEL: Record<TeamRole, { en: string; fr: string; descEn: string; descFr: string }> = {
  owner: { en: "Owner", fr: "Propriétaire", descEn: "Everything, including the team and the plan.", descFr: "Tout, y compris l'équipe et la formule." },
  manager: { en: "Manager", fr: "Gestionnaire", descEn: "Everything except the team, the payout account and the plan.", descFr: "Tout sauf l'équipe, le compte de versement et la formule." },
  catalog: { en: "Catalogue", fr: "Catalogue", descEn: "Products, stock, campaigns, coupons and flash sales.", descFr: "Produits, stock, campagnes, coupons et ventes flash." },
  orders: { en: "Orders", fr: "Commandes", descEn: "Orders, shipping, returns, disputes, replacements and exchanges.", descFr: "Commandes, expéditions, retours, litiges, remplacements et échanges." },
  finance: { en: "Finance", fr: "Finance", descEn: "Earnings, statements, payouts and tax documents.", descFr: "Gains, relevés, versements et documents fiscaux." },
  support: { en: "Support", fr: "Support", descEn: "Customer chat, questions, reviews and support tickets.", descFr: "Messages clients, questions, avis et tickets support." },
};

/** An owner (or an older server that sends no membership) can do everything. */
export function hasPermission(membership: SellerMembership | null | undefined, permission: SellerPermission): boolean {
  if (!membership || membership.isOwner) return true;
  return membership.permissions.includes(permission);
}
