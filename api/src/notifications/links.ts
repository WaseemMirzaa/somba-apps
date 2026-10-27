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
      if (t === 'exchange') return pick(`/shop/exchanges/${id}`, '/shop/returns');
      if (t === 'replacement') return pick(`/shop/replacements/${id}`, '/shop/returns');
      if (t === 'question') return pick(`/shop/products/${id}`, '/shop/notifications'); // entityId is the product
      if (t === 'chat') return pick(`/shop/messages/${id}`, '/shop/messages'); // entityId is the conversation
      return '/shop/notifications';
    case 'seller':
      if (t === 'order') return pick(`/seller/orders/${id}`, '/seller/orders');
      if (t === 'delivery') return '/seller/orders';
      if (t === 'moderation') return pick(`/seller/products/${id}`, '/seller/products');
      if (t === 'payout') return '/seller/finance/payouts';
      if (t === 'campaign') return pick(`/seller/promotions/${id}`, '/seller/promotions');
      if (t === 'flash') return '/seller/flash-sales';
      if (t === 'stock') return '/seller/inventory';
      if (t === 'finance') return '/seller/finance/tax';
      if (t === 'support') return pick(`/seller/support/${id}`, '/seller/support');
      if (t === 'return') return pick(`/seller/returns/${id}`, '/seller/returns');
      if (t === 'dispute') return pick(`/seller/disputes/${id}`, '/seller/disputes');
      if (t === 'replacement') return pick(`/seller/replacements/${id}`, '/seller/replacements');
      if (t === 'exchange') return pick(`/seller/exchanges/${id}`, '/seller/exchanges');
      if (t === 'question') return pick(`/seller/questions?focus=${id}`, '/seller/questions');
      if (t === 'review') return pick(`/seller/reviews?focus=${id}`, '/seller/reviews');
      if (t === 'chat') return pick(`/seller/messages/${id}`, '/seller/messages');
      if (t === 'team') return '/seller/team';
      if (t === 'security') return '/seller/settings';
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
      if (t === 'flash') return '/admin/marketing';
      if (t === 'stock') return '/admin/products';
      if (t === 'review' || t === 'question') return pick(`/admin/reviews?focus=${id}`, '/admin/reviews');
      if (t === 'exchange') return pick(`/admin/exchanges/${id}`, '/admin/exchanges');
      if (t === 'replacement') return pick(`/admin/replacements/${id}`, '/admin/replacements');
      return '/admin/notifications';
    case 'warehouse':
      if (t === 'return' || t === 'dispute') return pick(`/warehouse/returns/${id}`, '/warehouse/returns');
      if (t === 'exchange') return pick(`/warehouse/exchanges/${id}`, '/warehouse/exchanges');
      if (t === 'replacement') return pick(`/warehouse/replacements/${id}`, '/warehouse/replacements');
      if (t === 'order' || t === 'delivery') return '/warehouse/deliveries';
      if (t === 'support') return pick(`/warehouse/support/${id}`, '/warehouse/support');
      return '/warehouse/notifications';
    case 'rider':
      if (t === 'task') return pick(`/rider/tasks/${id}`, '/rider/tasks');
      if (t === 'support') return pick(`/rider/support/${id}`, '/rider/support');
      return '/rider/notifications';
  }
}
