/**
 * The web page a notification opens for its recipient, by portal. Sent with every push as `data.link` (and as the
 * web-push click target), so a tap lands on the order, ticket or task instead of the home page. Unknown types fall
 * back to the portal's notifications page.
 */
export type Portal = 'shop' | 'seller' | 'admin' | 'warehouse' | 'rider';

export function portalOf(role: string | null | undefined): Portal {
  if (role === 'seller') return 'seller';
  if (role === 'rider') return 'rider';
  if (role === 'warehouse_staff') return 'warehouse';
  if (role?.startsWith('admin')) return 'admin';
  return 'shop';
}

export function linkFor(role: string | null | undefined, type: string | null | undefined, entityId?: string | null): string {
  const portal = portalOf(role);
  const id = entityId ? encodeURIComponent(entityId) : '';
  const t = type ?? '';
  const pick = (withId: string, without: string) => (id ? withId : without);
  switch (portal) {
    case 'shop':
      if (t === 'order' || t === 'delivery') return pick(`/shop/orders/${id}`, '/shop/orders');
      if (t === 'payment') return '/shop/orders'; // entityId is an order id, or a payment id for top-ups
      if (t === 'return') return pick(`/shop/returns/${id}`, '/shop/returns');
      if (t === 'dispute') return pick(`/shop/disputes/${id}`, '/shop/returns');
      if (t === 'support') return pick(`/shop/support/${id}`, '/shop/support');
      if (t === 'exchange' || t === 'replacement') return '/shop/returns';
      return '/shop/notifications';
    case 'seller':
      if (t === 'order') return pick(`/seller/orders/${id}`, '/seller/orders');
      if (t === 'delivery') return '/seller/orders';
      if (t === 'moderation') return pick(`/seller/products/${id}`, '/seller/products');
      if (t === 'payout') return '/seller/finance/payouts';
      if (t === 'campaign') return pick(`/seller/promotions/${id}`, '/seller/promotions');
      if (t === 'support') return pick(`/seller/support/${id}`, '/seller/support');
      if (t === 'return') return pick(`/seller/returns/${id}`, '/seller/returns');
      if (t === 'dispute') return pick(`/seller/disputes/${id}`, '/seller/disputes');
      if (t === 'replacement') return pick(`/seller/replacements/${id}`, '/seller/replacements');
      if (t === 'exchange') return pick(`/seller/exchanges/${id}`, '/seller/exchanges');
      return '/seller/notifications';
    case 'admin':
      if (t === 'order' || t === 'delivery') return pick(`/admin/orders/${id}`, '/admin/orders');
      if (t === 'payment') return '/admin/finance';
      if (t === 'payout') return '/admin/payouts';
      if (t === 'moderation') return pick(`/admin/products/${id}`, '/admin/moderation');
      if (t === 'seller') return pick(`/admin/sellers/${id}`, '/admin/sellers');
      if (t === 'support') return pick(`/admin/support/${id}`, '/admin/support');
      if (t === 'return') return pick(`/admin/returns/${id}`, '/admin/returns');
      if (t === 'dispute') return pick(`/admin/disputes/${id}`, '/admin/disputes');
      if (t === 'campaign') return '/admin/marketing';
      if (t === 'exchange') return pick(`/admin/fulfillment/exchanges/${id}`, '/admin/fulfillment/exchanges');
      if (t === 'replacement') return pick(`/admin/fulfillment/replacements/${id}`, '/admin/fulfillment/replacements');
      return '/admin/notifications';
    case 'warehouse':
      if (t === 'return' || t === 'dispute') return pick(`/warehouse/returns/${id}`, '/warehouse/returns');
      if (t === 'exchange') return pick(`/warehouse/exchanges/${id}`, '/warehouse/exchanges');
      if (t === 'replacement') return pick(`/warehouse/replacements/${id}`, '/warehouse/replacements');
      if (t === 'order' || t === 'delivery') return '/warehouse/deliveries';
      return '/warehouse';
    case 'rider':
      if (t === 'task') return pick(`/rider/tasks/${id}`, '/rider/tasks');
      return '/rider/notifications';
  }
}
