import type { TeamRole } from '../database/entities/seller-team.entity';

/**
 * What a team member may do for the store (docs/contracts/seller-platform.md). A handler names the permission it
 * needs; `sellerContext` checks it against the caller's role.
 *
 *   any             read the store itself (sellers:mine, notifications, goals)
 *   insight         dashboards: sellers:stats, analytics:seller, goals
 *   catalog_read    products, categories, inventory (read)
 *   catalog         products, inventory, promotions / campaigns, flash-sale nominations, coupons, bulk import
 *   orders          orders, shipping, and the read-only after-sale view while admin turns it on (returns, exchanges and replacements are decided by KOMORIKO support)
 *   finance         payouts, statements, earnings, tax documents
 *   support         support tickets, product Q&A, review replies (customer chat is closed: customers contact KOMORIKO support)
 *   storefront      store profile, vacation mode, handling time, policy proposals (a policy goes live when KOMORIKO admin approves it; express delivery is admin-managed)
 *   team            invite / change role / remove staff            (owner only)
 *   payout_account  where money is sent                            (owner only)
 *   account         plan, KYC, security, closing the store         (owner only)
 */
export type SellerPermission =
  | 'any'
  | 'insight'
  | 'catalog_read'
  | 'catalog'
  | 'orders'
  | 'finance'
  | 'support'
  | 'storefront'
  | 'team'
  | 'payout_account'
  | 'account';

export const ALL_PERMISSIONS: readonly SellerPermission[] = [
  'any',
  'insight',
  'catalog_read',
  'catalog',
  'orders',
  'finance',
  'support',
  'storefront',
  'team',
  'payout_account',
  'account',
];

/** The matrix. `manager` = everything except the team, the payout account and the account itself. */
export const ROLE_PERMISSIONS: Record<TeamRole, readonly SellerPermission[]> = {
  owner: ALL_PERMISSIONS,
  manager: ['any', 'insight', 'catalog_read', 'catalog', 'orders', 'finance', 'support', 'storefront'],
  catalog: ['any', 'catalog_read', 'catalog'],
  orders: ['any', 'catalog_read', 'orders'],
  finance: ['any', 'insight', 'finance'],
  support: ['any', 'catalog_read', 'support'],
};

/** A suspended store is read-only, and only for what is already in flight: orders and earnings. */
export const SUSPENDED_READABLE: readonly SellerPermission[] = ['any', 'orders', 'finance', 'insight'];

export function roleAllows(role: TeamRole, permission: SellerPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const permissionsOf = (role: TeamRole): SellerPermission[] => [...(ROLE_PERMISSIONS[role] ?? [])];

/** Live events addressed to the owner that a team member may also hear, by what they carry. Null = personal to the owner. */
export function permissionForEvent(event: string): SellerPermission | null {
  const head = event.split(':')[0];
  switch (head) {
    case 'order':
    case 'delivery':
      return 'orders';
    case 'product':
      return 'catalog_read';
    case 'campaign':
    case 'flashsale':
    case 'coupon':
    case 'stock':
      return 'catalog';
    case 'payout':
      return 'finance';
    case 'review':
    case 'question':
    case 'support':
      return 'support';
    case 'seller':
      return 'any';
    // The private seller <-> support thread of a return / exchange / replacement (§13). The `dispute|exchange|replacement` heads stay owner-only: they also carry the owner's own purchases.
    case 'caseThread':
      return 'orders';
    default:
      return null;
  }
}

/** Which permission a saved notice (by its `type`) concerns: staff only get what their role handles. */
export function permissionForNotice(type: string | null | undefined): SellerPermission {
  switch (type) {
    case 'order':
    case 'delivery':
    // The read-only after-sale view (§13): a store's own cases, for the people who handle its orders.
    case 'seller_return':
    case 'seller_exchange':
    case 'seller_replacement':
      return 'orders';
    case 'payout':
    case 'finance':
      return 'finance';
    case 'moderation':
    case 'product':
    case 'stock':
    case 'campaign':
    case 'flash':
    case 'promo':
      return 'catalog';
    case 'review':
    case 'question':
    case 'support':
      return 'support';
    case 'team':
    case 'security':
    // After-sale and chat notices are about the owner's own shopping now (a store takes no part in them): owner only.
    case 'dispute':
    case 'return':
    case 'exchange':
    case 'replacement':
    case 'chat':
      return 'team';
    default:
      return 'storefront';
  }
}
