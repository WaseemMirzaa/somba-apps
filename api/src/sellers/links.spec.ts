import { linkFor } from '../notifications/links';

describe('where seller-platform notices open', () => {
  it('chat opens the conversation, for the shopper and for the store', () => {
    expect(linkFor('customer', 'chat', 'c1')).toBe('/shop/messages/c1');
    expect(linkFor('customer', 'chat', null)).toBe('/shop/messages');
    expect(linkFor('seller', 'chat', 'c1')).toBe('/seller/messages/c1');
    expect(linkFor('seller', 'chat', null)).toBe('/seller/messages');
  });
  it('team and security notices open the team and settings pages', () => {
    expect(linkFor('seller', 'team', 'm1')).toBe('/seller/team');
    expect(linkFor('seller', 'security', null)).toBe('/seller/settings');
  });
  it('everyone else falls back to their notifications', () => {
    expect(linkFor('customer', 'security', null)).toBe('/shop/notifications');
    expect(linkFor('admin', 'chat', 'c1')).toBe('/admin/notifications');
  });
});

describe('flash-sale notices', () => {
  it('open the flash sales page, not the campaigns page', () => {
    expect(linkFor('seller', 'flash', 'f1')).toBe('/seller/flash-sales');
    expect(linkFor('seller', 'flash', null)).toBe('/seller/flash-sales');
    expect(linkFor('seller', 'campaign', 'c1')).toBe('/seller/promotions/c1');
  });
});

describe('admin exchange and replacement notices', () => {
  it('open the admin exchange / replacement page (there is no /fulfillment section)', () => {
    expect(linkFor('admin', 'exchange', 'x1')).toBe('/admin/exchanges/x1');
    expect(linkFor('admin_support', 'replacement', 'r1')).toBe('/admin/replacements/r1');
    expect(linkFor('admin', 'exchange', null)).toBe('/admin/exchanges');
    expect(linkFor('admin', 'replacement', null)).toBe('/admin/replacements');
  });
});
