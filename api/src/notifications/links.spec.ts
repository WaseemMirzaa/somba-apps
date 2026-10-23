import { linkFor, portalOf } from './links';

describe('linkFor', () => {
  it('picks the portal from the role', () => {
    expect(portalOf('customer')).toBe('shop');
    expect(portalOf('seller')).toBe('seller');
    expect(portalOf('rider')).toBe('rider');
    expect(portalOf('warehouse_staff')).toBe('warehouse');
    expect(portalOf('admin_finance')).toBe('admin');
    expect(portalOf(undefined)).toBe('shop');
  });

  it('opens the record a notice is about', () => {
    expect(linkFor('customer', 'order', 'o1')).toBe('/shop/orders/o1');
    expect(linkFor('customer', 'return', 'd1')).toBe('/shop/returns/d1');
    expect(linkFor('seller', 'return', 'd1')).toBe('/seller/returns/d1');
    expect(linkFor('seller', 'exchange', 'e1')).toBe('/seller/exchanges/e1');
    expect(linkFor('seller', 'moderation', 'p1')).toBe('/seller/products/p1');
    expect(linkFor('admin_support', 'support', 't1')).toBe('/admin/support/t1');
    expect(linkFor('warehouse_staff', 'replacement', 'r1')).toBe('/warehouse/replacements/r1');
    expect(linkFor('rider', 'task', 'k1')).toBe('/rider/tasks/k1');
  });

  it('falls back to a list or the inbox', () => {
    expect(linkFor('customer', 'order', null)).toBe('/shop/orders');
    expect(linkFor('customer', 'marketing', null)).toBe('/shop/notifications');
    expect(linkFor('seller', 'seller', 's1')).toBe('/seller/notifications');
    expect(linkFor('admin', 'whatever', 'x')).toBe('/admin/notifications');
  });

  it('escapes ids', () => {
    expect(linkFor('customer', 'order', 'a/b')).toBe('/shop/orders/a%2Fb');
  });
});
