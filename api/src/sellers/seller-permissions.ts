import type { TeamRole } from '../database/entities/seller-team.entity';

/**
 * What a team member may do for the store (docs/contracts/seller-platform.md). A handler names the permission it
 * needs; `sellerContext` checks it against the caller's role.
 *
 *   any             read the store itself (sellers:mine, notifications, goals)
 *   insight         dashboards: sellers:stats, analytics:seller, goals
 *   catalog_read    products, categories, inventory (read)
 *   catalog         products, inventory, promotions / campaigns, flash-sale nominations, coupons, bulk import
 *   orders          orders, returns, disputes, replacements, exchanges, shipping
 *   finance         payouts, statements, earnings, tax documents
 *   support         support tickets, product Q&A, review replies, customer chat
 *   storefront      store profile, vacation mode, handling time, policies
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
    case 'exchange':
    case 'replacement':
    case 'dispute':
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
    default:
      return null;
  }
}

/** Which permission a saved notice (by its `type`) concerns: staff only get what their role handles. */
export function permissionForNotice(type: string | null | undefined): SellerPermission {
  switch (type) {
    case 'order':
    case 'delivery':
    case 'dispute':
    case 'return':
    case 'exchange':
    case 'replacement':
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
    case 'chat':
      return 'support';
    case 'team':
    case 'security':
      return 'team';
    default:
      return 'storefront';
  }
}
