import { ALL_PERMISSIONS, ROLE_PERMISSIONS, SUSPENDED_READABLE, permissionForEvent, permissionForNotice, permissionsOf, roleAllows } from './seller-permissions';
import type { TeamRole } from '../database/entities';

const ROLES: TeamRole[] = ['owner', 'manager', 'catalog', 'orders', 'finance', 'support'];

describe('team role permissions', () => {
  it('the owner can do everything', () => {
    for (const p of ALL_PERMISSIONS) expect(roleAllows('owner', p)).toBe(true);
  });

  it('a manager can do everything except run the team, the payout account and the account itself', () => {
    const denied = ALL_PERMISSIONS.filter((p) => !roleAllows('manager', p));
    expect(denied.sort()).toEqual(['account', 'payout_account', 'team']);
  });

  it('only the owner has the three sensitive permissions', () => {
    for (const p of ['team', 'payout_account', 'account'] as const) {
      expect(ROLES.filter((r) => roleAllows(r, p))).toEqual(['owner']);
    }
  });

  it('finance only has payouts / statements (plus the dashboards that show them)', () => {
    expect(permissionsOf('finance').sort()).toEqual(['any', 'finance', 'insight']);
  });

  it('catalog covers products, inventory and promotions; not orders or money', () => {
    expect(roleAllows('catalog', 'catalog')).toBe(true);
    expect(roleAllows('catalog', 'orders')).toBe(false);
    expect(roleAllows('catalog', 'finance')).toBe(false);
    expect(roleAllows('catalog', 'support')).toBe(false);
  });

  it('orders covers orders, returns and shipping; support covers support, Q&A, reviews', () => {
    expect(roleAllows('orders', 'orders')).toBe(true);
    expect(roleAllows('orders', 'catalog')).toBe(false);
    expect(roleAllows('support', 'support')).toBe(true);
    expect(roleAllows('support', 'orders')).toBe(false);
    expect(roleAllows('support', 'catalog')).toBe(false);
  });

  it('every role can read the store itself', () => {
    for (const r of ROLES) expect(roleAllows(r, 'any')).toBe(true);
  });

  it('every permission in the matrix is a known permission', () => {
    for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r]) expect(ALL_PERMISSIONS).toContain(p);
  });

  it('a suspended store can only be read for what is in flight', () => {
    expect([...SUSPENDED_READABLE].sort()).toEqual(['any', 'finance', 'insight', 'orders']);
  });

  it('an unknown role is allowed nothing', () => {
    expect(roleAllows('hacker' as TeamRole, 'any')).toBe(false);
  });
});

describe('what staff hear', () => {
  it('maps live events to the permission that handles them', () => {
    expect(permissionForEvent('order:created')).toBe('orders');
    expect(permissionForEvent('order:updated')).toBe('orders');
    expect(permissionForEvent('exchange:updated')).toBe('orders');
    expect(permissionForEvent('replacement:updated')).toBe('orders');
    expect(permissionForEvent('dispute:updated')).toBe('orders');
    expect(permissionForEvent('product:created')).toBe('catalog_read');
    expect(permissionForEvent('campaign:updated')).toBe('catalog');
    expect(permissionForEvent('payout:created')).toBe('finance');
    expect(permissionForEvent('review:updated')).toBe('support');
    expect(permissionForEvent('support:updated')).toBe('support');
    expect(permissionForEvent('seller:updated')).toBe('any');
  });

  it('keeps personal events personal', () => {
    for (const e of ['notification:new', 'wallet:updated', 'wallet:transaction', 'cart:updated', 'me:updated', 'wishlist:updated', 'addresses:updated', 'chat:message', 'team:updated']) {
      expect(permissionForEvent(e)).toBeNull();
    }
  });

  it('maps notices by type, and keeps security and team notices with the owner', () => {
    expect(permissionForNotice('order')).toBe('orders');
    expect(permissionForNotice('return')).toBe('orders');
    expect(permissionForNotice('payout')).toBe('finance');
    expect(permissionForNotice('moderation')).toBe('catalog');
    expect(permissionForNotice('stock')).toBe('catalog');
    expect(permissionForNotice('review')).toBe('support');
    expect(permissionForNotice('chat')).toBe('support');
    expect(permissionForNotice('team')).toBe('team');
    expect(permissionForNotice('security')).toBe('team');
    expect(permissionForNotice('seller')).toBe('storefront');
    expect(permissionForNotice(undefined)).toBe('storefront');
  });

  it('a finance member never receives an order notice; a manager receives every kind except owner-only ones', () => {
    expect(roleAllows('finance', permissionForNotice('order'))).toBe(false);
    for (const t of ['order', 'payout', 'moderation', 'review', 'chat', 'seller', 'system']) expect(roleAllows('manager', permissionForNotice(t))).toBe(true);
    for (const t of ['team', 'security']) expect(roleAllows('manager', permissionForNotice(t))).toBe(false);
  });
});
